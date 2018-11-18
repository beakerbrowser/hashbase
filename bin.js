var config = require('./lib/config')
var createApp = require('./index')
var log = require('debug')('LE')
var figures = require('figures')

async function start () {
  var app = await createApp(config)
  if (config.letsencrypt) {
    var greenlockExpress = require('greenlock-express')
    var debug = config.letsencrypt.debug !== false
    var agreeTos = config.letsencrypt.agreeTos !== false
    greenlockExpress.create({
      version: 'draft-11',
      server: debug ? 'https://acme-staging-v02.api.letsencrypt.org/directory' : 'https://acme-v02.api.letsencrypt.org/directory',
      debug,
      agreeTos,
      approveDomains: app.approveDomains,
      app,
      log
    }).listen(80, 443)
  } else {
    app.listen(config.port, () => {
      console.log(figures.tick, `Server started on http://127.0.0.1:${config.port}`)
    })
  }
}
start()
