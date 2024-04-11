import Lucida from './build/index.js';
import Soundcloud from './build/streamers/soundcloud/main.js'

const lucida = new Lucida({
  modules: {
    soundcloud: new Soundcloud({"oauthToken": "2-294707-1346470389-4thCm1p3QnA05"})
  },
  logins: {}
});

console.log(await lucida.search("ram ranch"))