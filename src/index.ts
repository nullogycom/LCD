import { ItemType, GetByUrlResponse, SearchResults, Streamer, StreamerWithLogin } from './types.js'

interface LucidaOptions {
	modules: { [key: string]: Streamer | StreamerWithLogin }
	logins?: {
		[key: string]: {
			username: string
			password: string
		}
	}
}

class Lucida {
	modules: { [key: string]: Streamer | StreamerWithLogin }
	hostnames: string[]
	logins?: { [key: string]: { username: string; password: string } }
	constructor(options: LucidaOptions) {
		this.modules = options.modules
		this.hostnames = Object.values(this.modules)
			.map((e) => e.hostnames)
			.flat()
		if (options.logins) this.logins = options.logins
	}
	async login() {
		if (!this.logins) throw new Error('No logins specified')
		for (const i in this.logins) {
			const credentials = this.logins[i]
			const module = this.modules[i]
			if (module && 'login' in module) {
				await module.login?.(credentials.username, credentials.password)
			}
		}
	}
	async search(query: string, limit: number): Promise<{ [key: string]: SearchResults }> {
		const results = await Promise.all(
			Object.values(this.modules).map((e) => e.search(query, limit))
		)
		const moduleNames = Object.keys(this.modules)
		return Object.fromEntries(results.map((e, i) => [moduleNames[i], e]))
	}
	async getTypeFromUrl(url: string): Promise<ItemType> {
		const urlObj = new URL(url)
		for (const i in this.modules) {
			const matches = this.modules[i].hostnames.includes(urlObj.hostname)
			if (!matches) continue
			return await this.modules[i].getTypeFromUrl(url)
		}
		throw new Error(`Couldn't find module for hostname ${urlObj.hostname}`)
	}
	getByUrl(url: string, limit?: number): Promise<GetByUrlResponse> {
		const urlObj = new URL(url)
		for (const i in this.modules) {
			const matches = this.modules[i].hostnames.includes(urlObj.hostname)
			if (!matches) continue
			return this.modules[i].getByUrl(url, limit)
		}
		throw new Error(`Couldn't find module for hostname ${urlObj.hostname}`)
	}
	disconnect() {
		return Promise.all(
			Object.values(this.modules).map((e) => {
				return e.disconnect?.()
			})
		)
	}
}

export default Lucida
