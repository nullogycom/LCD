import { Artist, Album, Track } from '../../types.js'
import { spawn } from 'child_process'
import fetch from 'node-fetch'
import { imageSize as sizeOf } from 'image-size'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

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

export async function parseHls(url: string, container: string): Promise<NodeJS.ReadableStream> {
	return new Promise(async function(resolve, reject) {
		const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lucida'))

		const ffmpegProc = spawn('ffmpeg', [
			'-hide_banner',
			'-loglevel',
			'error',
			'-i',
			url,
			'-c:a',
			'copy',
			'-f',
			container,
			`${folder}/hls.${container}`
		])

		let err: string

		ffmpegProc.stderr.on('data', function(data) {
			err = data.toString()
		})
		
		ffmpegProc.once('exit', function(code) {
			if (code == 0) resolve(fs.createReadStream(`${folder}/hls.${container}`))
			else reject((`FFMPEG HLS error: ${err}` || 'FFMPEG could not parse the HLS.'))
		})
	})
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
