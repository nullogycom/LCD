import type {
	SpotifyAlbum,
	SpotifyArtist,
	SpotifyThumbnail,
	SpotifyTrack
} from 'librespot/build/utils/types'
import { Album, Artist, Track } from '../../types'

function parseThumbnails(raw: SpotifyThumbnail[]) {
	return raw
		.sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
		.map((e) => {
			return {
				width: e.width ?? 0,
				height: e.height ?? 0,
				url: e.url
			}
		})
}

export function parseArtist(raw: SpotifyArtist) {
	const artist: Artist = {
		id: raw.id,
		url: raw.externalUrl,
		name: raw.name
	}
	if (raw.avatar) artist.pictures = parseThumbnails(raw.avatar).map((e) => e.url)
	if (raw.albums) artist.albums = raw.albums.map((e) => parseAlbum(e))
	return artist
}

export function parseTrack(raw: SpotifyTrack) {
	const track: Track = {
		title: raw.name,
		id: raw.id,
		url: raw.externalUrl,
		explicit: raw.explicit,
		trackNumber: raw.trackNumber,
		discNumber: raw.discNumber,
		artists: raw.artists?.map((e) => parseArtist(e)) ?? [],
		durationMs: raw.durationMs
	}
	if (raw.album) track.album = parseAlbum(raw.album)
	return track
}

export function parseAlbum(raw: SpotifyAlbum): Album {
	return {
		title: raw.name,
		id: raw.id,
		url: raw.externalUrl,
		trackCount: raw.totalTracks,
		releaseDate: raw.releaseDate,
		coverArtwork: parseThumbnails(raw.coverArtwork),
		artists: raw.artists.map((e) => parseArtist(e))
	}
}
