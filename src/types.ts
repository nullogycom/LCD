type Id = string | number

type ItemType = 'artist' | 'album' | 'track'

export interface CoverArtwork {
	url: string
	width: number
	height: number
}

export interface Artist {
	id: Id
	url: string
	pictures?: string[]
	name: string
	albums?: Album[]
	tracks?: Track[]
}

export interface Album {
	title: string
	id: Id
	url: string
	upc?: string
	trackCount?: number
	discCount?: number
	releaseDate?: Date
	coverArtwork?: CoverArtwork[]
	artists?: Artist[]
}

export interface Track {
	title: string
	id: Id
	url: string
	explicit?: boolean
	trackNumber?: number
	discNumber?: number
	copyright?: string
	artists: Artist[]
	isrc?: string
	producers?: string[]
	composers?: string[]
	lyricists?: string[]
	album?: Album
	durationMs?: number
	coverArtwork?: CoverArtwork[]
}

export interface SearchResults {
	query: string
	albums: Album[]
	tracks: Track[]
	artists: Artist[]
}

export interface GetStreamResponse {
	sizeBytes: number
	stream: NodeJS.ReadableStream
	mimeType: string
}

// got a better name for this?
export type GetByUrlResponse =
	| TrackGetByUrlResponse
	| ArtistGetByUrlResponse
	| AlbumGetByUrlResponse

export interface TrackGetByUrlResponse {
	type: 'track'
	getStream(): Promise<GetStreamResponse>
	metadata: Track
}
export interface ArtistGetByUrlResponse {
	type: 'artist'
	metadata: Artist
}
export interface AlbumGetByUrlResponse {
	type: 'album'
	tracks: Track[]
	metadata: Album
}

export interface Streamer {
	hostnames: string[]
	search(query: string, limit: number): Promise<SearchResults>
	getTypeFromUrl: ((url: string) => ItemType) | ((url: string, limit?: number) => ItemType)
	getByUrl(url: string): Promise<GetByUrlResponse>
	disconnect?(): Promise<void>
}

export interface StreamerWithLogin extends Streamer {
	login(username: string, password: string): Promise<void>
}
