var http = require('http')
var level = require('level-party')
var township = require('township')
var appa = require('appa')

var send = require('appa/send')
var error = require('appa/error')
var config = require('./config')
var hypercloud = require('./lib/cloud')

var db = level(config.township.db)
var ship = township(config.township, db)
var cloud = hypercloud(config.cloud)
var app = appa()
var log = app.log

app.on('/', function (req, res, ctx) {
  send(200, 'HYPERCLOUD - p2p + cloud').pipe(res)
})

app.on('/register', function (req, res, ctx) {
  ship.register(req, res, ctx, function (err, statusCode, obj) {
    if (err) return error(400, err.message).pipe(res)
    send(obj).pipe(res)
  })
})

app.on('/addUser', function (req, res, ctx) {
  // adds a archive to backup + serve
  if (req.method === 'POST') {
    ship.verify(req, res, function (err, decoded, token) {
      if (err) return error(400, err.message).pipe(res)
      if (!decoded) return error(403, 'Not authorized').pipe(res)
      cloud.addUser(req, res, ctx, function (err, code, data) {
        if (err) return app.error(res, code, err.message)
        send(code, data).pipe(res)
      })
    })
  } else {
    error(500, 'method not allowed').pipe(res)
  }
})

app.on('/login', function (req, res, ctx) {
  ship.login(req, res, ctx, function (err, code, token) {
    if (err) return error(400, err.message).pipe(res)
    send(token).pipe(res)
  })
})

app.on('/logout', function (req, res, ctx) {

})

http.createServer(function (req, res) {
  if (/[0-9a-f]{64}$/.test(req.url)) {
    return cloud.dat.httpRequest(req, res)
  }
  return app(req, res)
}).listen(config.port, function () {
  log.info(`server started on http://127.0.0.1:${config.port}`)
})
