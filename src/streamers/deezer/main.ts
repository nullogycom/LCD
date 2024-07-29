import fetch from 'node-fetch'
import {
	Album,
	Artist,
	GetByUrlResponse,
	GetStreamResponse,
	ItemType,
	SearchResults,
	StreamerAccount,
	StreamerWithLogin,
	Track
} from '../../types.js'
import { BLOWFISH_SECRET, CLIENT_ID, CLIENT_SECRET, GW_LIGHT_URL } from './constants.js'
import { createHash } from 'crypto'
import {
	DeezerAlbum,
	DeezerArtist,
	DeezerFormat,
	DeezerLoginResponse,
	DeezerMediaResponse,
	DeezerTrack,
	DeezerUserData,
	parseAlbum,
	parseArtist,
	parseTrack
} from './parse.js'
import { Transform } from 'stream'
import { Blowfish } from 'blowfish-cbc'

interface DeezerOptions {
	arl?: string
}

interface APIMethod {
	'deezer.getUserData': DeezerUserData
	'deezer.pageArtist': {
		DATA: DeezerArtist
		TOP: { data?: DeezerTrack[] }
		ALBUMS: { data?: DeezerAlbum[] }
	}
	'deezer.pageAlbum': {
		DATA: DeezerAlbum
		SONGS: { data: DeezerTrack[] }
	}
	'deezer.pageTrack': {
		DATA: DeezerTrack
	}
	'user.getArl': string
	'search.music': { data: (DeezerArtist | DeezerAlbum | DeezerTrack)[] }
	'song.getListData': { data: DeezerTrack[] }
	'song.getData': DeezerTrack
}

export default class Deezer implements StreamerWithLogin {
	hostnames = ['deezer.com', 'www.deezer.com', 'deezer.page.link']

	headers: { [header: string]: string } = {
		Accept: '*/*',
		'User-Agent':
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
		'Content-Type': 'text/plain;charset=UTF-8',
		Origin: 'https://www.deezer.com',
		'Sec-Fetch-Site': 'same-origin',
		'Sec-Fetch-Mode': 'same-origin',
		'Sec-Fetch-Dest': 'empty',
		Referer: 'https://www.deezer.com/',
		'Accept-Language': 'en-US,en;q=0.9'
	}

	arl?: string
	apiToken?: string
	licenseToken?: string
	renewTimestamp?: number
	country?: string
	language?: string

	availableFormats: Set<DeezerFormat> = new Set()

	constructor(options?: DeezerOptions) {
		if (options?.arl) this.#loginViaArl(options.arl)
	}

	async #apiCall<T extends keyof APIMethod>(
		method: T,
		data: { [key: string]: string | number | string[] } = {}
	): Promise<APIMethod[T]> {
		let apiToken = this.apiToken
		if (method == 'deezer.getUserData' || method == 'user.getArl') apiToken = ''

		const url = `${GW_LIGHT_URL}?${new URLSearchParams({
			method,
			input: '3',
			api_version: '1.0',
			api_token: apiToken ?? '',
			cid: Math.floor(Math.random() * 1e9).toString()
		})}`

		interface DeezerResponse {
			results: APIMethod[T]
			error: number[] | { [key: string]: string }
		}

		const body = JSON.stringify(data)
		const req = await fetch(url, { method: 'POST', body, headers: this.headers })
		const { results, error } = <DeezerResponse>await req.json()

		if (error.constructor.name == 'Object') {
			const [type, msg] = Object.entries(error)[0]
			throw new Error(`API Error: ${type}\n${msg}`)
		}

		if (method == 'deezer.getUserData') {
			const setCookie = req.headers.get('Set-Cookie') ?? ''
			const sid = setCookie.match(/sid=(fr[0-9a-f]+)/)![1]
			this.headers['Cookie'] += `arl=${this.arl}; sid=${sid}`

			const res = <APIMethod['deezer.getUserData']>results

			this.apiToken = res.checkForm
			this.licenseToken = res.USER?.OPTIONS?.license_token

			this.country = res?.COUNTRY
			this.language = res?.USER?.SETTING?.global?.language

			this.availableFormats = new Set([DeezerFormat.MP3_128])
			if (res?.USER?.OPTIONS?.web_hq) this.availableFormats.add(DeezerFormat.MP3_320)
			if (res?.USER?.OPTIONS?.web_lossless) this.availableFormats.add(DeezerFormat.FLAC)

			this.renewTimestamp = Date.now()
		}

		return results
	}

	async #loginViaArl(arl: string) {
		this.arl = arl
		this.headers['Cookie'] = `arl=${arl}`
		const userData = await this.#apiCall('deezer.getUserData')

		if (userData.USER.USER_ID == 0) {
			delete this.headers['Cookie']
			this.arl = undefined
			throw new Error('Invalid ARL')
		}

		return userData
	}

	#md5(str: string) {
		return createHash('md5').update(str).digest('hex')
	}

	async login(username: string, password: string): Promise<void> {
		if (this.arl) {
			return
		}

		const resp = await fetch('https://www.deezer.com/', { headers: this.headers })
		const setCookie = resp.headers.get('Set-Cookie') ?? ''
		const sid = setCookie.match(/sid=(fr[0-9a-f]+)/)![1]
		this.headers['Cookie'] = `sid=${sid}`

		password = this.#md5(password)

		const loginReq = await fetch(
			`https://connect.deezer.com/oauth/user_auth.php?${new URLSearchParams({
				app_id: CLIENT_ID,
				login: username,
				password,
				hash: this.#md5(CLIENT_ID + username + password + CLIENT_SECRET)
			})}`,
			{ headers: this.headers }
		)
		const { error } = <DeezerLoginResponse>await loginReq.json()

		if (error) throw new Error('Error while getting access token, check your credentials')

		const arl = await this.#apiCall('user.getArl')

		await this.#loginViaArl(arl)
	}

	/* ---------- SEARCH ---------- */

	async search(query: string, limit: number): Promise<SearchResults> {
		const results = await Promise.all([
			this.#searchArtists(query, limit),
			this.#searchAlbums(query, limit),
			this.#searchTracks(query, limit)
		])

		const [artists, albums, tracks] = results

		return { query, albums, tracks, artists }
	}

	async #searchArtists(query: string, limit: number): Promise<Artist[]> {
		const { data } = await this.#apiCall('search.music', {
			query,
			start: 0,
			nb: limit,
			filter: 'ALL',
			output: 'ARTIST'
		})
		return data.map((a) => parseArtist(a as DeezerArtist))
	}

	async #searchAlbums(query: string, limit: number): Promise<Album[]> {
		const { data } = await this.#apiCall('search.music', {
			query,
			start: 0,
			nb: limit,
			filter: 'ALL',
			output: 'ALBUM'
		})
		return data.map((a) => parseAlbum(a as DeezerAlbum))
	}

	async #searchTracks(query: string, limit: number): Promise<Track[]> {
		const { data } = await this.#apiCall('search.music', {
			query,
			start: 0,
			nb: limit,
			filter: 'ALL',
			output: 'TRACK'
		})
		return data.map((t) => parseTrack(t as DeezerTrack))
	}

	/* ---------- GET INFO FROM URL ---------- */

	async #unshortenUrl(url: URL): Promise<URL> {
		const res = await fetch(url, { redirect: 'manual' })
		const location = res.headers.get('Location')

		if (res.status != 302 || !location) throw new Error('URL not supported')

		return new URL(location)
	}

	async #getInfoFromUrl(url: URL): Promise<{ type: ItemType; id: number }> {
		if (url.hostname == 'deezer.page.link') url = await this.#unshortenUrl(url)

		const match = url.pathname.match(/^\/(?:[a-z]{2}\/)?(track|album|artist)\/(\d+)\/?$/)
		if (!match) throw new Error('URL not supported')

		const [, type, id] = match

		return { type: <ItemType>type, id: parseInt(id) }
	}

	async getTypeFromUrl(url: string): Promise<ItemType> {
		const urlObj = new URL(url)
		const { type } = await this.#getInfoFromUrl(urlObj)
		return type
	}

	/* ---------- GET BY URL ---------- */

	// Artist

	async #getArtist(id: number): Promise<Artist> {
		const { DATA, TOP, ALBUMS } = await this.#apiCall('deezer.pageArtist', {
			art_id: id,
			lang: 'en'
		})

		return parseArtist(DATA, TOP.data, ALBUMS.data)
	}

	// Album

	async #getAlbum(id: number): Promise<{ metadata: Album; tracks: Track[] }> {
		const { DATA, SONGS } = await this.#apiCall('deezer.pageAlbum', {
			alb_id: id,
			lang: 'en'
		})

		return {
			metadata: parseAlbum(DATA),
			tracks: SONGS.data.map(parseTrack)
		}
	}

	// Track

	async #getTrackData(id: number): Promise<DeezerTrack> {
		return (
			await this.#apiCall('deezer.pageTrack', {
				sng_id: id
			})
		).DATA
	}

	async #getStream(track: DeezerTrack): Promise<GetStreamResponse> {
		if ('FALLBACK' in track) track = track.FALLBACK!

		const countries = track.AVAILABLE_COUNTRIES.STREAM_ADS
		if (!countries.length) throw new Error('Track not available in any country')
		if (!countries.includes(this.country!))
			throw new Error("Track not available in the account's country")

		let format: DeezerFormat = DeezerFormat.MP3_128
		const formatsToCheck = [
			{
				format: DeezerFormat.FLAC,
				filesize: track.FILESIZE_FLAC
			},
			{
				format: DeezerFormat.MP3_320,
				filesize: track.FILESIZE_MP3_320
			}
		]
		for (const f of formatsToCheck) {
			if (f.filesize != '0' && this.availableFormats.has(f.format)) {
				format = f.format
				break
			}
		}

		const id = track.SNG_ID
		const trackToken = track.TRACK_TOKEN
		const trackTokenExpiry = track.TRACK_TOKEN_EXPIRE

		let mimeType = ''
		switch (format) {
			case (DeezerFormat.MP3_128, DeezerFormat.MP3_320):
				mimeType = 'audio/mpeg'
				break
			case DeezerFormat.FLAC:
				mimeType = 'audio/flac'
		}

		// download

		const url = await this.#getTrackUrl(id, trackToken, trackTokenExpiry, format)
		const streamResp = await fetch(url)
		if (!streamResp.ok)
			throw new Error(`Failed to get track stream. Status code: ${streamResp.status}`)

		const decryptionKey = this.#getTrackDecryptionKey(id)
		const blowfish = new Blowfish(decryptionKey)

		const chunkSize = 2048 * 3
		const buf = Buffer.alloc(chunkSize)
		let bufSize = 0

		const decryption = new Transform({
			transform(c, _, callback) {
				const chunk = <Buffer>c
				let chunkBytesRead = 0
				while (chunkBytesRead != chunk.length) {
					const slice = chunk.subarray(
						chunkBytesRead,
						chunkBytesRead + (chunkSize - (bufSize % chunkSize))
					)
					chunkBytesRead += slice.length

					slice.copy(buf, bufSize)
					bufSize += slice.length

					if (bufSize == chunkSize) {
						bufSize = 0
						const copy = Buffer.alloc(chunkSize)
						buf.copy(copy, 0)

						if (copy.length >= 2048) {
							const encryptedChunk = copy.subarray(0, 2048)
							blowfish.decryptChunk(encryptedChunk)
						}

						this.push(copy)
					}
				}
				callback()
			},

			flush(callback) {
				if (bufSize != 0) {
					const final = buf.subarray(0, bufSize)
					if (final.length >= 2048) {
						const encryptedChunk = final.subarray(0, 2048)
						blowfish.decryptChunk(encryptedChunk)
					}
					this.push(final)
				}
				callback()
			}
		})

		return {
			stream: streamResp.body!.pipe(decryption),
			mimeType
		}
	}

	async #getTrackUrl(
		id: string,
		trackToken: string,
		trackTokenExpiry: number,
		format: DeezerFormat
	): Promise<string> {
		if (Date.now() - (this.renewTimestamp ?? 0) >= 3600)
			// renew license token
			await this.#apiCall('deezer.getUserData')

		if (Date.now() - trackTokenExpiry >= 0)
			// renew track token
			trackToken = (
				await this.#apiCall('song.getData', {
					sng_id: id,
					array_default: ['TRACK_TOKEN']
				})
			).TRACK_TOKEN

		const req = await fetch('https://media.deezer.com/v1/get_url', {
			method: 'POST',
			body: JSON.stringify({
				license_token: this.licenseToken,
				media: [
					{
						type: 'FULL',
						formats: [{ cipher: 'BF_CBC_STRIPE', format: DeezerFormat[format] }]
					}
				],
				track_tokens: [trackToken]
			})
		})
		const res = <DeezerMediaResponse>await req.json()

		return res.data[0].media[0].sources[0].url
	}

	#getTrackDecryptionKey(id: string): Uint8Array {
		const hash = this.#md5(id)

		const key = new Uint8Array(16)
		for (let i = 0; i < 16; i++) {
			key[i] = hash.charCodeAt(i) ^ hash.charCodeAt(i + 16) ^ BLOWFISH_SECRET.charCodeAt(i)
		}

		return key
	}

	async getByUrl(url: string): Promise<GetByUrlResponse> {
		const { type, id } = await this.#getInfoFromUrl(new URL(url))

		switch (type) {
			case 'artist': {
				return {
					type: 'artist',
					metadata: await this.#getArtist(id)
				}
			}
			case 'album': {
				return {
					type: 'album',
					...(await this.#getAlbum(id))
				}
			}
			case 'track': {
				const track = await this.#getTrackData(id)
				return {
					type: 'track',
					metadata: parseTrack(track),
					getStream: () => {
						return this.#getStream(track)
					}
				}
			}
			default:
				throw new Error('URL unrecognised')
		}
	}

	async getAccountInfo(): Promise<StreamerAccount> {
		const userData = await this.#apiCall('deezer.getUserData')

		return {
			valid: userData.USER.USER_ID != 0,
			premium: userData.OFFER_ID != 0,
			country: userData.COUNTRY,
			explicit: userData.USER.EXPLICIT_CONTENT_LEVEL != 'explicit_hide'
		}
	}
}
