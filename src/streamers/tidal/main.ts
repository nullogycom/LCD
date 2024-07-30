import fetch from 'node-fetch'
import { spawn } from 'child_process'
import {
	ItemType,
	GetByUrlResponse,
	GetStreamResponse,
	SearchResults,
	Streamer,
	Track,
	StreamerAccount
} from '../../types.js'
import { TIDAL_AUTH_BASE, TIDAL_API_BASE, TIDAL_SUBSCRIPTION_BASE } from './constants.js'
import {
	Contributor,
	RawAlbum,
	RawArtist,
	RawTrack,
	addCredits,
	parseAlbum,
	parseArtist,
	parseMpd,
	parseTrack
} from './parse.js'
import Stream from 'stream'

interface TidalOptions {
	tvToken: string
	tvSecret: string
	accessToken: string
	refreshToken: string
	expires: number
	countryCode: string
}

interface LoginData {
	error: string
	access_token: string
	refresh_token: string
	expires_in: number
}

interface SessionData {
	countryCode: string
	userId: number
	status?: number
	userMessage?: string
}

interface SubscriptionData {
	startDate: string
	validUntil: string
	status: string
	subscription: {
		type: string
		offlineGracePeriod: number
	}
	highestSoundQuality: string
	premiumAccess: boolean
	canGetTrial: boolean
	paymentType: string
	paymentOverdue: boolean
}

export default class Tidal implements Streamer {
	tvToken: string
	tvSecret: string
	accessToken: string
	refreshToken: string
	expires: number
	countryCode: string
	userId: number | undefined
	hostnames = ['tidal.com', 'www.tidal.com', 'listen.tidal.com']
	testData = {
		'https://tidal.com/browse/artist/3908662': {
			type: 'artist',
			title: 'Tyler, The Creator'
		},
		'https://tidal.com/browse/album/109485854': {
			type: 'album',
			title: 'IGOR'
		},
		'https://tidal.com/browse/track/95691774': {
			type: 'track',
			title: 'Potato Salad'
		}
	} as const
	failedAuth = false
	constructor(options: TidalOptions) {
		this.tvToken = options.tvToken
		this.tvSecret = options.tvSecret

		// TODO: ideally this should be stored in a .config file
		this.accessToken = options.accessToken
		this.refreshToken = options.refreshToken
		this.expires = options.expires
		this.countryCode = options.countryCode

		const getReady = async () => {
			if (!this.refreshToken) return
			if (await this.sessionValid()) return
			const success = await this.refresh()
			if (!success) console.log(`[tidal] Failed to refresh tokens, this could be a bad sign`)
		}
		getReady()
	}
	headers() {
		return {
			'X-Tidal-Token': this.tvToken,
			Authorization: `Bearer ${this.accessToken}`,
			'Accept-Encoding': 'gzip',
			'User-Agent': 'TIDAL_ANDROID/1039 okhttp/3.14.9'
		}
	}
	async #get(
		url: string,
		params: { [key: string]: string | number } = {},
		base: string = TIDAL_API_BASE
	): Promise<unknown> {
		if (this.failedAuth) throw new Error(`Last request failed to authorize, get new tokens`)
		if (Date.now() > this.expires) await this.refresh()
		if (!this.countryCode) await this.getCountryCode()
		params.countryCode = params.countryCode ?? this.countryCode
		params.locale = params.locale ?? 'en_US'
		params.deviceType = params.deviceType ?? 'TV'
		for (const key in params) {
			if (typeof params[key] == 'number') params[key] = params[key].toString()
		}
		const response = await fetch(
			`${base}${url}?${new URLSearchParams(<{ [key: string]: string }>params)}`,
			{
				headers: this.headers()
			}
		)
		if (!response.ok) {
			const errMsg = await response.text()
			try {
				const json = JSON.parse(errMsg)
				const sessionValid = await this.sessionValid()
				if (json.status == 401 && !sessionValid) {
					this.failedAuth = !(await this.refresh())
					console.log('[tidal] Refreshed tokens')
					if (this.failedAuth) {
						throw new Error('Auth failed. Try getting new tokens.')
					}
					return this.#get(url, params)
				}
				console.error('[tidal] Tidal error response:', json)
			} catch (error) {
				console.error('[tidal] Tidal error response:', errMsg)
			}
			throw new Error(`Fetching ${url} from Tidal failed with status code ${response.status}.`)
		}
		return await response.json()
	}
	async sessionValid() {
		const resp = await fetch('https://api.tidal.com/v1/sessions', {
			headers: this.headers()
		})
		return resp.ok
	}
	async getCountryCode() {
		const sessionResponse = await fetch('https://api.tidal.com/v1/sessions', {
			headers: this.headers()
		})
		if (sessionResponse.status != 200) return false
		const sessionData = <SessionData>await sessionResponse.json()
		this.countryCode = sessionData.countryCode
		this.userId = sessionData.userId
		return true
	}
	async getTokens() {
		const deviceAuthResponse = await fetch(`${TIDAL_AUTH_BASE}oauth2/device_authorization`, {
			method: 'post',
			body: new URLSearchParams({
				client_id: this.tvToken,
				scope: 'r_usr w_usr'
			})
		})
		if (deviceAuthResponse.status != 200) throw new Error(`Couldn't authorize Tidal`)
		interface DeviceAuth {
			deviceCode: string
			userCode: string
		}
		const deviceAuth = <DeviceAuth>await deviceAuthResponse.json()
		const linkUrl = `https://link.tidal.com/${deviceAuth.userCode}`
		const checkToken = async () => {
			const params = {
				client_id: this.tvToken,
				client_secret: this.tvSecret,
				device_code: deviceAuth.deviceCode,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
				scope: 'r_usr w_usr'
			}
			let loginData: LoginData | null = null
			let statusCode = 400
			while (statusCode == 400) {
				await new Promise((r) => setTimeout(r, 1000))
				const loginResponse = await fetch(`${TIDAL_AUTH_BASE}oauth2/token`, {
					method: 'post',
					body: new URLSearchParams(params)
				})
				statusCode = loginResponse.status
				loginData = <LoginData>await loginResponse.json()
			}
			if (statusCode != 200 || !loginData) throw new Error(`Failed to log in. ${loginData?.error}`)

			this.accessToken = loginData.access_token
			this.refreshToken = loginData.refresh_token
			this.expires = Date.now() + loginData.expires_in * 1000
			await this.getCountryCode()

			console.log('[tidal] Using the following new config:', this.getCurrentConfig())
		}
		console.log(`[tidal] Log in at ${linkUrl}`)
		checkToken()
		return linkUrl
	}
	getCurrentConfig() {
		return {
			tvToken: this.tvToken,
			tvSecret: this.tvSecret,
			accessToken: this.accessToken,
			refreshToken: this.refreshToken,
			expires: this.expires,
			countryCode: this.countryCode
		}
	}
	async refresh() {
		const refreshResponse = await fetch(`${TIDAL_AUTH_BASE}oauth2/token`, {
			method: 'post',
			body: new URLSearchParams({
				refresh_token: this.refreshToken,
				client_id: this.tvToken,
				client_secret: this.tvSecret,
				grant_type: 'refresh_token'
			})
		})

		if (refreshResponse.status == 200) {
			const refreshData: LoginData = <LoginData>await refreshResponse.json()
			this.expires = Date.now() + refreshData.expires_in * 1000
			this.accessToken = refreshData.access_token
			if (refreshData.refresh_token) this.refreshToken = refreshData.refresh_token
			return true
		}
		return false
	}
	async search(query: string, limit = 20): Promise<SearchResults> {
		interface RawSearchResults {
			albums: {
				items: RawAlbum[]
			}
			artists: {
				items: RawArtist[]
			}
			tracks: {
				items: RawTrack[]
			}
		}
		const results = <RawSearchResults>await this.#get('search/top-hits', {
			query: query,
			limit: limit,
			offset: 0,
			types: 'ARTISTS,ALBUMS,TRACKS',
			includeContributors: 'true',
			includeUserPlaylists: 'true',
			supportsUserData: 'true'
		})

		return {
			query,
			albums: results.albums.items.map((raw) => parseAlbum(raw)),
			artists: results.artists.items.map(parseArtist),
			tracks: results.tracks.items.map(parseTrack)
		}
	}
	async #getTrack(trackId: number | string) {
		const trackResponse = <RawTrack>await this.#get(`tracks/${trackId}`)
		const contributorResponse = (<{ items: Contributor[] }>(
			await this.#get(`tracks/${trackId}/contributors`)
		)).items
		trackResponse.album = <RawAlbum>await this.#get(`albums/${trackResponse.album.id}`)
		return parseTrack(addCredits(trackResponse, contributorResponse))
	}
	async #getAlbum(albumId: number | string) {
		const albumResponse = await this.#get(`albums/${albumId}`)
		return parseAlbum(<RawAlbum>albumResponse)
	}
	async #getAlbumTracks(albumId: number | string): Promise<Track[]> {
		interface TracksContributors {
			items: {
				item: RawTrack
				credits: Contributor[]
			}[]
		}
		const contributorResponse = <TracksContributors>await this.#get(
			`albums/${albumId}/items/credits`,
			{
				replace: 'true',
				offset: 0,
				includeContributors: 'true',
				limit: 100
			}
		)
		return contributorResponse.items.map((item) => parseTrack(addCredits(item.item, item.credits)))
	}
	async #getArtist(artistId: number | string) {
		const [artistResponse, albumsResponse, tracksResponse] = await Promise.all([
			<Promise<RawArtist>>this.#get(`artists/${artistId}`),
			<Promise<{ items: RawAlbum[] }>>this.#get(`artists/${artistId}/albums`, {
				limit: 20
			}),
			<Promise<{ items: RawTrack[] }>>this.#get(`artists/${artistId}/toptracks`, {
				limit: 20
			})
		])
		return {
			...parseArtist(artistResponse),
			albums: albumsResponse.items.map(parseAlbum),
			tracks: tracksResponse.items.map(parseTrack)
		}
	}
	async #getFileUrl(
		trackId: number | string,
		quality = 'HI_RES_LOSSLESS'
	): Promise<GetStreamResponse> {
		interface PlaybackInfo {
			manifest: string
			manifestMimeType: string
			audioQuality: 'LOW' | 'HIGH' | 'LOSSLESS' | 'HI_RES' | 'HI_RES_LOSSLESS'
		}
		const playbackInfoResponse = <PlaybackInfo>await this.#get(
			`tracks/${trackId}/playbackinfopostpaywall/v4`,
			{
				playbackmode: 'STREAM',
				assetpresentation: 'FULL',
				audioquality: quality,
				prefetch: 'false'
			}
		)

		if (playbackInfoResponse.audioQuality == 'HIGH' || playbackInfoResponse.audioQuality == 'LOW')
			throw new Error('This ripper is incompatible with AAC codecs formats at the moment.')

		const manifestStr = Buffer.from(playbackInfoResponse.manifest, 'base64').toString('utf-8')
		interface Manifest {
			mimeType: string
			urls: string[]
		}

		if (playbackInfoResponse.manifestMimeType != 'application/dash+xml') {
			const manifest = <Manifest>JSON.parse(manifestStr)
			const streamResponse = await fetch(manifest.urls[0])
			return {
				mimeType: manifest.mimeType,
				sizeBytes: parseInt(<string>streamResponse.headers.get('Content-Length')),
				stream: <NodeJS.ReadableStream>streamResponse.body
			}
		}

		const trackUrls = parseMpd(manifestStr)

		const ffmpegProc = spawn('ffmpeg', [
			'-hide_banner',
			'-loglevel',
			'error',
			'-i',
			'-',
			'-c:a',
			'copy',
			'-f',
			'flac',
			'-'
		])

		const stream = new Stream.Readable({
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			read() {}
		})
		async function load() {
			for (const url of trackUrls) {
				const resp = await fetch(url)
				if (!resp.body) throw new Error('Response has no body')
				for await (const chunk of resp.body) {
					stream.push(chunk)
				}
			}
			stream.push(null)
		}
		stream.pipe(ffmpegProc.stdin)
		ffmpegProc.stderr.pipe(process.stderr)
		load()

		return {
			mimeType: 'audio/flac',
			stream: ffmpegProc.stdout
		}
	}
	#getUrlParts(url: string): ['artist' | 'album' | 'track', string] {
		const urlParts = url
			.match(/^https?:\/\/(?:www\.|listen\.)?tidal\.com\/(?:browse\/)?(.*?)\/(.*?)\/?$/)
			?.slice(1, 3)
		if (!urlParts) throw new Error('URL not supported')
		urlParts[1] = urlParts[1].replace(/\?.*?$/, '')
		if (urlParts[0] != 'artist' && urlParts[0] != 'album' && urlParts[0] != 'track') {
			throw new Error('URL unrecognised')
		}
		return [urlParts[0], urlParts[1]]
	}
	async getTypeFromUrl(url: string): Promise<ItemType> {
		return this.#getUrlParts(url)[0]
	}
	async getByUrl(url: string): Promise<GetByUrlResponse> {
		const [type, id] = this.#getUrlParts(url)
		switch (type) {
			case 'track':
				return {
					type,
					getStream: () => {
						return this.#getFileUrl(id)
					},
					metadata: await this.#getTrack(id)
				}
			case 'album':
				return {
					type,
					tracks: await this.#getAlbumTracks(id),
					metadata: await this.#getAlbum(id)
				}
			case 'artist':
				return {
					type,
					metadata: await this.#getArtist(id)
				}
		}
	}
	async getAccountInfo(): Promise<StreamerAccount> {
		if (this.userId == undefined || this.countryCode == undefined) {
			if (Date.now() > this.expires) await this.refresh()
			const sessionResponse = await fetch('https://api.tidal.com/v1/sessions', {
				headers: this.headers()
			})
			const sessionData = <SessionData>await sessionResponse.json()

			this.userId = sessionData.userId
			this.countryCode = sessionData.countryCode
		}
		const subscription = <SubscriptionData>(
			await this.#get(`users/${this.userId}/subscription`, {}, TIDAL_SUBSCRIPTION_BASE)
		)

		return {
			valid: true,
			premium: subscription.premiumAccess,
			country: this.countryCode,
			explicit: true
		}
	}
}
