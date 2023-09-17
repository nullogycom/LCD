import { Artist, Album, Track } from '../../types.js'

export interface RawArtist {
	id: number
	name: string
	picture?: string
	image?: {
		small: string
		medium: string
		large: string
	}
	albums?: {
		items: RawAlbum[]
	}
	tracks_appears_on?: {
		items: RawTrack[]
	}
}

export function parseArtist(raw: RawArtist): Artist {
	const artist: Artist = {
		id: raw.id.toString(),
		url: `https://play.qobuz.com/artist/${raw.id.toString()}`,
		name: raw.name
	}
	if (raw.picture) artist.pictures = [raw.picture]
	else if (raw.image) artist.pictures = [raw.image.small, raw.image.medium, raw.image.large]

	if (raw.albums) artist.albums = raw.albums.items.map(parseAlbum)
	if (raw.tracks_appears_on) artist.tracks = raw.tracks_appears_on.items.map(parseTrack)

	return artist
}

export interface RawAlbum {
	title: string
	id: string
	url: string
	image: {
		thumbnail: string
		small: string
		large: string
	}
	tracks?: {
		items: RawTrack[]
	}
	artists?: RawArtist[]
	artist: RawArtist
}

export function parseAlbum(raw: RawAlbum): Album {
	return {
		title: raw.title,
		id: raw.id,
		url: raw.url ?? `https://play.qobuz.com/album/${raw.id}`,
		coverArtwork: [
			{
				url: raw.image.thumbnail,
				width: 50,
				height: 50
			},
			{
				url: raw.image.small,
				width: 230,
				height: 230
			},
			{
				url: raw.image.large,
				width: 600,
				height: 600
			}
		],
		artists: raw.artists?.map(parseArtist) ?? [parseArtist(raw.artist)]
	}
}

export interface RawTrack {
	title: string
	id: number
	copyright?: string
	performer: RawArtist
	album?: RawAlbum
	track_number?: number
	media_number?: number
	duration: number
}

export function parseTrack(raw: RawTrack): Track {
	const track: Track = {
		title: raw.title,
		id: raw.id.toString(),
		url: `https://play.qobuz.com/track/${raw.id.toString()}`,
		copyright: raw.copyright,
		artists: [parseArtist(raw.performer)],
		durationMs: raw.duration * 1000
	}
	if (raw.album) track.album = parseAlbum(raw.album)
	if (raw.track_number) track.trackNumber = raw.track_number
	if (raw.media_number) track.discNumber = raw.media_number
	return track
}
