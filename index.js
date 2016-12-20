var http = require('http')
var level = require('level-party')
var township = require('township')
var express = require('express')
var bodyParser = require('body-parser')

var config = require('./config')
var hypercloud = require('./lib/cloud')

const DAT_HASH_REGEX = /[0-9a-f]{64}$/

var db = level(config.township.db)
var ship = township(config.township, db)
var cloud = hypercloud(config.cloud)
var app = express()

app.use(bodyParser.json())

app.get('/', (req, res) => {
  res.send('HYPERCLOUD - p2p + cloud')
})

app.post('/v1/register', (req, res) => {
  ship.register(req, res, { body: req.body }, (err, code, obj) => {
    if (err) return res.status(code).send(err.message)
    res.status(code).json(obj)
  })
})

app.post('/v1/profile', (req, res) => {
  ship.verify(req, res, (err, decoded, token) => {
    if (err) return res.status(400).send(err.message)
    if (!decoded) return res.status(403).send('Not authorized')
    cloud.addUser(req, res, (err, code, data) => {
      if (err) return res.status(code).send(err.message)
      res.status(code).json(data)
    })
  })
})

app.post('/v1/login', (req, res) => {
  ship.login(req, res, { body: req.body }, (err, code, token) => {
    if (err) return res.status(code).send(err.message)
    res.status(code).send(token)
  })
})

app.post('/v1/logout', (req, res) => {
  // TODO
})

app.get(DAT_HASH_REGEX, (req, res) => {
  cloud.dat.httpRequest(req, res)
})

http.createServer(app).listen(config.port, () => {
  console.log(`server started on http://127.0.0.1:${config.port}`)
})
