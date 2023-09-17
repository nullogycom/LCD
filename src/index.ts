import { GetByUrlResponse, SearchResults, StreamerWithLogin } from './types.js'

interface LucidaOptions {
	modules: { [key: string]: StreamerWithLogin }
	logins?: {
		[key: string]: {
			username: string
			password: string
		}
	}
}

class Lucida {
	modules: { [key: string]: StreamerWithLogin }
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
			await this.modules[i]?.login?.(credentials.username, credentials.password)
		}
	}
	async search(query: string, limit: number): Promise<{ [key: string]: SearchResults }> {
		const results = await Promise.all(
			Object.values(this.modules).map((e) => e.search(query, limit))
		)
		const moduleNames = Object.keys(this.modules)
		return Object.fromEntries(results.map((e, i) => [moduleNames[i], e]))
	}
	getTypeFromUrl(url: string): 'artist' | 'album' | 'track' {
		const urlObj = new URL(url)
		for (const i in this.modules) {
			const matches = this.modules[i].hostnames.includes(urlObj.hostname)
			if (!matches) continue
			return this.modules[i].getTypeFromUrl(url)
		}
		throw new Error(`Couldn't find module for hostname ${urlObj.hostname}`)
	}
	getByUrl(url: string): Promise<GetByUrlResponse> {
		const urlObj = new URL(url)
		for (const i in this.modules) {
			const matches = this.modules[i].hostnames.includes(urlObj.hostname)
			if (!matches) continue
			return this.modules[i].getByUrl(url)
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
