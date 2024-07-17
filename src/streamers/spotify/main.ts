import Librespot, { LibrespotOptions } from 'librespot'
import { parseArtist, parseAlbum, parseTrack, parseEpisode, parsePodcast } from './parse.js'
import { GetByUrlResponse, ItemType, SearchResults, StreamerAccount, StreamerWithLogin } from '../../types.js'

class Spotify implements StreamerWithLogin {
	client: Librespot
	hostnames = ['open.spotify.com']
	constructor(options: LibrespotOptions) {
		this.client = new Librespot(options)
	}
	login(username: string, password: string) {
		return this.client.login(username, password)
	}
	#getUrlParts(url: string): ['artist' | 'album' | 'track' | 'episode' | 'show', string] {
		const urlObj = new URL(url)
		const parts = urlObj.pathname.slice(1).split('/')
		if (parts.length > 2) throw new Error('Unknown Spotify URL')
		if (parts[0] != 'artist' && parts[0] != 'track' && parts[0] != 'album' && parts[0] != 'show' && parts[0] != 'episode') {
			throw new Error(`Spotify type "${parts[0]}" unsupported`)
		}
		if (!parts[1]) throw new Error('Unknown Spotify URL')
		return [parts[0], parts[1]]
	}
	async getTypeFromUrl(url: string) {
		let type: ItemType | 'show' = this.#getUrlParts(url)[0]

		if (type == 'show') type = 'podcast'

		return type
	}
	async getByUrl(url: string, limit = 0): Promise<GetByUrlResponse> {
		const [type, id] = this.#getUrlParts(url)
		switch (type) {
			case 'track': {
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
			case 'artist': {
				const metadata = await this.client.get.artistMetadata(id)
				const albums = await this.client.get.artistAlbums(id, limit)
				return {
					type,
					metadata: {
						...parseArtist(metadata),
						albums: albums.map((e) => parseAlbum(e))
					}
				}
			}
			case 'album': {
				const metadata = await this.client.get.albumMetadata(id)
				const tracks = await this.client.get.albumTracks(id)
				if (tracks) {
					return {
						type,
						metadata: {...parseAlbum(metadata), trackCount: tracks.length},
						tracks: tracks?.map((e) => parseTrack(e)) ?? []
					}
				}
				return {
					type,
					metadata: parseAlbum(metadata),
					tracks: []
				}
			}
			case 'episode': {
				const metadata = await this.client.get.episodeMetadata(id)
				return {
					type,
					getStream: async () => {
						const streamData = await this.client.get.episodeStream(id)
						return {
							mimeType: 'audio/ogg',
							sizeBytes: streamData.sizeBytes,
							stream: streamData.stream
						}
					},
					metadata: parseEpisode(metadata)
				}
			}
			case 'show': {
				const metadata = await this.client.get.podcastMetadata(id)
				return {
					type: 'podcast',
					metadata: parsePodcast(metadata),
					episodes: (metadata.episodes?.map((e) => parseEpisode(e))) ?? []
				}
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
	async getAccountInfo(): Promise<StreamerAccount> {
		return {
			valid: true,
			premium: (await this.client.isPremium())
		}
	}
	disconnect() {
		return this.client.disconnect()
	}
}

export default Spotify
