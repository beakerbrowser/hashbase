var level = require('level-party')
var express = require('express')
var bodyParser = require('body-parser')
var multicb = require('multicb')
var wrap = require('co-express')
var expressValidator = require('express-validator')

var hypercloud = require('./lib')
var customValidators = require('./lib/validators')
var customSanitizers = require('./lib/sanitizers')

module.exports = function (config) {
  var cloud = hypercloud(config)

  var app = express()
  app.cloud = cloud
  app.config = config

  app.use(bodyParser.json())
  app.use(expressValidator({ customValidators, customSanitizers }))
  app.use(cloud.sessions.middleware())

  app.get('/', (req, res) => {
    if (req.query.view === 'status') {
      cloud.api.archives.status((err, code, data) => {
        if (err) res.status(code).send(err.message)
        res.status(code).json(data)
      })
    } else {
      res.send('HYPERCLOUD - p2p + cloud')
    }
  })

  // user & auth
  // =

  app.post('/v1/register', wrap(cloud.api.users.register))
  app.post('/v1/verify', wrap(cloud.api.users.verify))
  app.get('/v1/account', wrap(cloud.api.users.getAccount))
  app.post('/v1/account', wrap(cloud.api.users.updateAccount))
  app.post('/v1/login', wrap(cloud.api.users.login))
  app.post('/v1/logout', wrap(cloud.api.users.logout))

  // archive admin
  // =

  app.post('/v1/dat/add', (req, res) => {
    // TODO admin perms -prf
    cloud.api.archives.add(req.body, (err, code, data) => {
      if (err) res.status(code).send(err.message)
      res.status(code).json(data)
    })
  })

  app.post('/v1/dat/remove', (req, res) => {
    // TODO admin perms -prf
    cloud.api.archives.remove(req.body, (err, code, data) => {
      if (err) res.status(code).send(err.message)
      res.status(code).json(data)
    })
  })

  // archive read
  // =

  app.get(/^\/[0-9a-f]{64}\/?$/, (req, res) => {
    if (req.query.view === 'status') {
      cloud.api.archives.archiveProgress(req.path.slice(1), (err, code, data) => {
        if (err) res.status(code).send(err.message)
        res.status(code).json(data)
      })
    } else {
      cloud.dat.httpRequest(req, res)
    }
  })

  // error-handling fallback
  // =

  app.use((err, req, res) => {
    // handle validation errors
    // TODO is there a better way to detect that the error came from express-validator? -prf
    if ('isEmpty' in err) {
      return res.code(422).json({
        message: 'Invalid inputs',
        invalidInputs: true,
        details: err.array()
      })
    }

    // general uncaught error
    console.error('[ERROR]', err)
    res.code(500).json({
      message: 'Internal server error',
      internalError: true
    })
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
