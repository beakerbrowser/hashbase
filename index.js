var level = require('level-party')
var township = require('township')
var express = require('express')
var bodyParser = require('body-parser')
var multicb = require('multicb')
var hypercloud = require('./lib/cloud')

const DAT_HASH_REGEX = /[0-9a-f]{64}$/

module.exports = function (config) {
  var db = typeof config.township.db === 'string'
    ? level(config.township.db)
    : config.township.db
  var ship = township(config.township, db)
  var cloud = hypercloud(config.cloud)

  var app = express()
  app.cloud = cloud
  app.config = config

  app.use(bodyParser.json())

  app.get('/', (req, res) => {
    res.send('HYPERCLOUD - p2p + cloud')
  })

  // user & auth
  // =

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

  // archive admin
  // =

  app.post('/v1/dat/add', (req, res) => {
    // TODO admin perms -prf
    cloud.api.add(req, res, { body: req.body }, (err, code, data) => {
      if (err) res.status(code).send(err.message)
      res.status(code).json(data)
    })
  })

  app.post('/v1/dat/remove', (req, res) => {
    // TODO admin perms -prf
    cloud.api.remove(req, res, { body: req.body }, (err, code, data) => {
      if (err) res.status(code).send(err.message)
      res.status(code).json(data)
    })
  })

  // archive read
  // =

  app.get(DAT_HASH_REGEX, (req, res) => {
    if (req.query.view === 'status') {
      cloud.api.status(req, res, null, (err, code, data) => {
        if (err) res.status(code).send(err.message)
        res.status(code).json(data)
      })
    } else {
      cloud.dat.httpRequest(req, res)
    }
  })

  // shutdown
  // =

  app.close = cb => {
    var done = multicb()
    cloud.close(done())
    db.close(done())
    done(cb)
  }

  return app
}
