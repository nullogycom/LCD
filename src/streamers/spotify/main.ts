import Librespot from 'librespot'
import { parseArtist, parseAlbum, parseTrack } from './parse.js'
import { GetByUrlResponse, SearchResults, StreamerWithLogin } from '../../types.js'
import { SpotifyAlbum, SpotifyArtist } from 'librespot/types'

class Spotify implements StreamerWithLogin {
	client: Librespot
	hostnames = ['open.spotify.com']
	constructor(options: never) {
		this.client = new Librespot(options)
	}
	login(username: string, password: string) {
		return this.client.login(username, password)
	}
	#getUrlParts(url: string): ['artist' | 'album' | 'track', string] {
		const urlObj = new URL(url)
		const parts = urlObj.pathname.slice(1).split('/')
		if (parts.length > 2) throw new Error('Unknown Spotify URL')
		if (parts[0] != 'artist' && parts[0] != 'track' && parts[0] != 'album') {
			throw new Error(`Spotify type "${parts[0]}" unsupported`)
		}
		if (!parts[1]) throw new Error('Unknown Spotify URL')
		return [parts[0], parts[1]]
	}
	getTypeFromUrl(url: string) {
		return this.#getUrlParts(url)[0]
	}
	async getByUrl(url: string): Promise<GetByUrlResponse> {
		const [type, id] = this.#getUrlParts(url)
		if (type == 'track') {
			const metadata = await this.client.get.trackMetadata(id)
			return {
				type,
				getStream: async () => {
					const streamData = await this.client.get.trackStream(id)
					return {
						mimeType: 'audio/ogg',
						sizeBytes: streamData.sizeBytes,
						stream: streamData.stream
					}
				},
				metadata: parseTrack(metadata)
			}
		}
		const data = await this.client.get.byUrl(url)
		let metadata
		switch (type) {
			case 'artist':
				metadata = parseArtist(<SpotifyArtist>data)
				return {
					type,
					metadata
				}
			case 'album':
				metadata = parseAlbum(<SpotifyAlbum>data)
				if ((<SpotifyAlbum>data).tracks) {
					return {
						type,
						metadata,
						tracks: (<SpotifyAlbum>data).tracks?.map((e) => parseTrack(e)) ?? []
					}
				}
				return {
					type,
					metadata,
					tracks: []
				}
		}
	}
	async search(query: string): Promise<SearchResults> {
		const results = await this.client.browse.search(query)
		return {
			query,
			albums: results.albums?.map((e) => parseAlbum(e)) ?? [],
			artists: results.artists?.map((e) => parseArtist(e)) ?? [],
			tracks: results.tracks?.map((e) => parseTrack(e)) ?? []
		}
	}
	disconnect() {
		return this.client.disconnect()
	}
}

export default Spotify
