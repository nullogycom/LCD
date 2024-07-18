type Id = string | number

export type ItemType = 'artist' | 'album' | 'track' | 'episode' | 'podcast'
export type Region = string

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
	description?: string
	copyright?: string,
	label?: string,
	genre?: string[]
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
	performers?: string[]
	engineers?: string[]
	album?: Album
	durationMs?: number
	coverArtwork?: CoverArtwork[]
	regions?: Region[]
	genres?: string[]
	releaseDate?: Date
	description?: string
}

export interface Episode {
	title: string
	id: Id
	url: string
	explicit?: boolean
	episodeNumber?: number
	copyright?: string
	description?: string
	producers?: string[]
	composers?: string[]
	podcast?: Podcast
	durationMs?: number
	coverArtwork?: CoverArtwork[]
	releaseDate?: Date
}

export interface Podcast {
	title: string
	id: Id
	url: string
	explicit?: boolean
	description?: string
	coverArtwork?: CoverArtwork[]
	episodes?: Episode[]
}

export interface SearchResults {
	query: string
	albums: Album[]
	tracks: Track[]
	artists: Artist[]
}

export interface GetStreamResponse {
	sizeBytes?: number
	stream: NodeJS.ReadableStream
	mimeType: string
}

// got a better name for this?
export type GetByUrlResponse =
	| TrackGetByUrlResponse
	| ArtistGetByUrlResponse
	| AlbumGetByUrlResponse 
	| EpisodeGetByUrlResponse
	| PodcastGetByUrlResponse

export interface TrackGetByUrlResponse {
	type: 'track'
	getStream(): Promise<GetStreamResponse>
	metadata: Track
}
export interface EpisodeGetByUrlResponse {
	type: 'episode'
	getStream(): Promise<GetStreamResponse>
	metadata: Episode
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
export interface PodcastGetByUrlResponse {
	type: 'podcast'
	episodes: Episode[]
	metadata: Podcast
}

export interface StreamerAccount {
	valid: boolean
	premium?: boolean
	country?: string
} 

export interface Streamer {
	hostnames: string[]
	search(query: string, limit: number): Promise<SearchResults>
	getTypeFromUrl(url: string): Promise<ItemType>
	getByUrl:
		| ((url: string) => Promise<GetByUrlResponse>)
		| ((url: string, limit?: number) => Promise<GetByUrlResponse>)
	disconnect?(): Promise<void>
	getAccountInfo?(): Promise<StreamerAccount>
}

export interface StreamerWithLogin extends Streamer {
	login(username: string, password: string): Promise<void>
}