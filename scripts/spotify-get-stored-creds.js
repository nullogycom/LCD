import Spotify from './../build/streamers/spotify/main.js'

const client = new Spotify({})
await client.login(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PASSWORD)

const storedCreds = client.getStoredCredentials()
console.log('[spotify] New config:', storedCreds)

await client.disconnect()
