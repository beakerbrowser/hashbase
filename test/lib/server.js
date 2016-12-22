var request = require('request')
var memdb = require('memdb')
var RAM = require('random-access-memory')
var createApp = require('../../index.js')

var portCounter = 10000

module.exports = function (cb) {
  if (process.env.REMOTE_URL) {
    return createRemoteApp(cb)
  } else {
    return createLocalApp(cb)
  }
}

function createRemoteApp (cb) {
  var url = process.env.REMOTE_URL
  console.log(`connecting to ${url}`)
  var app = {
    url,
    isRemote: true,
    req: request.defaults({ baseUrl: url, timeout: 10e3 }),
    close: cb => cb()
  }
  cb()
  return app
}

function createLocalApp (cb) {
  // setup config
  // =

  var config = {
    township: {
      secret: 'very very not secret',
      db: memdb(),
      email: {
        fromEmail: 'hi@example.com',
        postmarkAPIKey: 'your api key'
      }
    },
    cloud: {
      db: memdb(),
      storage: RAM
    },
    port: portCounter++
  }

  config.township.publicKey = `-----BEGIN PUBLIC KEY-----
  MIGbMBAGByqGSM49AgEGBSuBBAAjA4GGAAQAvmJlA/DZl3SVKNl0OcyVbsMTOmTM
  qU0Avhmcl6r8qxkBgjwArIxQr7G7v8m0LOeFIklnmF3sYAwA+8llHGFReV8ASW4w
  5AUC8ngZThaH9xk6DQscaMmoEFPN5thWpNcwMgUFYovBtPLwtAZjYr9Se+UT/5k4
  VltW7ko6SHbCfMgUUbU=
  -----END PUBLIC KEY-----`

  config.township.privateKey = `-----BEGIN EC PRIVATE KEY-----
  MIHbAgEBBEFmz7VMXRtCPTlBETqMMx/mokyA3xPXra2SkcA7Xh0N6sgne1rgSZNU
  ngT6TR3XLfBOt5+p5GRW6p1FVtn+vtPyRKAHBgUrgQQAI6GBiQOBhgAEAL5iZQPw
  2Zd0lSjZdDnMlW7DEzpkzKlNAL4ZnJeq/KsZAYI8AKyMUK+xu7/JtCznhSJJZ5hd
  7GAMAPvJZRxhUXlfAEluMOQFAvJ4GU4Wh/cZOg0LHGjJqBBTzebYVqTXMDIFBWKL
  wbTy8LQGY2K/UnvlE/+ZOFZbVu5KOkh2wnzIFFG1
  -----END EC PRIVATE KEY-----`

  // create server
  // =

  var app = createApp(config)
  var server = app.listen(config.port, (err) => {
    console.log(`server started on http://127.0.0.1:${config.port}`)
    cb(err)
  })

  app.isRemote = false
  app.url = `http://127.0.0.1:${config.port}`
  app.req = request.defaults({
    baseUrl: app.url
  })

  // wrap app.close to stop the server
  var orgClose = app.close
  app.close = cb => orgClose.call(app, () => server.close(cb))

  return app
}
