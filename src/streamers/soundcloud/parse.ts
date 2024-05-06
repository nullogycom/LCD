import { Artist, Album, Track } from '../../types.js'
import { spawn } from 'child_process'
import fetch from 'node-fetch'
import { imageSize as sizeOf } from 'image-size'
import Stream from 'stream'

async function parseCoverArtwork(url: string) {
	const resp = await fetch(url)
	if (!resp.body) throw new Error('No body on image')
	const chunks = []
	for await (const chunk of resp.body) {
		chunks.push(Buffer.from(chunk))
	}
	const dimensions = sizeOf(Buffer.concat(chunks))
	if (!dimensions.width || !dimensions.height) throw new Error(`Couldn't get dimensions`)
	return {
		url,
		width: dimensions.width,
		height: dimensions.height
	}
}

export interface RawArtist {
	id: number
	username: string
	full_name: string
	avatar_url?: string
	permalink_url: string
	kind: 'user'
}

export interface Headers {
	Authorization?: string
	'User-Agent': string
}

export function parseArtist(raw: RawArtist): Artist {
	const artist: Artist = {
		id: raw.id,
		url: raw.permalink_url,
		name: raw.username
	}
	if (raw.avatar_url) {
		artist.pictures = [raw.avatar_url, raw.avatar_url?.replace('-large', '-original')]
	}
	return artist
}

export interface RawAlbum {
	title: string
	id: number
	permalink_url: string
	tracks: RawTrack[]
	track_count: number
	release_date: string
	user: RawArtist
	kind: 'playlist'
}

export async function parseAlbum(raw: RawAlbum): Promise<Album> {
	const album: Album = {
		id: raw.id,
		title: raw.title,
		url: raw.permalink_url,
		trackCount: raw.track_count,
		releaseDate: new Date(raw.release_date),
		artists: [parseArtist(raw.user)]
	}
	if (raw.tracks?.[0]?.artwork_url != undefined) {
		album.coverArtwork = [await parseCoverArtwork(raw?.tracks?.[0]?.artwork_url)]
	}
	return album
}

export interface RawTrack {
	media?: {
		transcodings?: { duration: number }[]
	}
	kind: 'track'
	id: number
	title: string
	permalink_url: string
	artwork_url?: string
	full_duration: number
	user: RawArtist
}

export async function parseTrack(raw: RawTrack): Promise<Track> {
	const track: Track = {
		id: raw.id,
		title: raw.title,
		url: raw.permalink_url,
		artists: [parseArtist(raw.user)],
		durationMs: raw.media?.transcodings?.[0]?.duration
	}

	if (raw?.artwork_url != undefined) {
		track.coverArtwork = [await parseCoverArtwork(raw?.artwork_url)]
	}

	return track
}

export async function parseHls(url: string, codec: string): Promise<NodeJS.ReadableStream> {
	const m3u8 = await (await fetch(url)).text()

	const urls = <URL[]>[]
	for (const i in m3u8.split('\n')) {
		if (m3u8.split('\n')[i].startsWith('#')) continue
		else urls.push(new URL(m3u8.split('\n')[i]))
	}

	const stream = new Stream.Readable({
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		read() {}
	})

	async function load() {
		for (const url of urls) {
			const resp = await fetch(url)
			if (!resp.body) throw new Error('Response has no body')
			for await (const chunk of resp.body) {
				stream.push(chunk)
			}
		}
		stream.push(null)
	}

	const ffmpegProc = spawn('ffmpeg', [
		'-hide_banner',
		'-loglevel',
		'error',
		'-i',
		'-',
		'-c:a',
		'copy',
		'-f',
		codec,
		'-'
	])

	stream.pipe(ffmpegProc.stdin)
	ffmpegProc.stderr.pipe(process.stderr)
	load()

	return stream
}

export interface RawSearchResults {
	collection: (RawAlbum | RawTrack | RawArtist)[]
	total_results: number
	facets: []
	next_href: string
	query_urn: string
}

export interface ScClient {
	anonId: string
	version: string
	id: string | undefined
}
