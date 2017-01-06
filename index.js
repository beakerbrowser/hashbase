var express = require('express')
var bodyParser = require('body-parser')
var multicb = require('multicb')
var expressValidator = require('express-validator')

var Hypercloud = require('./lib')
var customValidators = require('./lib/validators')
var customSanitizers = require('./lib/sanitizers')

module.exports = function (config) {
  var cloud = new Hypercloud(config)
  cloud.setupAdminUser()

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

  app.post('/v1/register', cloud.api.users.register)
  app.get('/v1/verify', cloud.api.users.verify)
  app.post('/v1/verify', cloud.api.users.verify)
  app.get('/v1/account', cloud.api.users.getAccount)
  app.post('/v1/account', cloud.api.users.updateAccount)
  app.post('/v1/login', cloud.api.users.login)
  app.post('/v1/logout', cloud.api.users.logout)

  // archives
  // =

  // app.post('/v1/archives/add', (req, res, next) => {
  //   console.log('hit')
  //   next()
  // })
  app.post('/v1/archives/add', cloud.api.archives.add)
  app.post('/v1/archives/remove', cloud.api.archives.remove)
  app.get(/^\/[0-9a-f]{64}\/?$/, cloud.api.archives.get)

  // error-handling fallback
  // =

  app.use((err, req, res, next) => {
    // validation errors
    if ('isEmpty' in err) {
      return res.status(422).json({
        message: 'Invalid inputs',
        invalidInputs: true,
        details: err.array()
      })
    }

    // common errors
    if ('status' in err) {
      return res.status(err.status).json(err.body)
    }

    // general uncaught error
    console.error('[ERROR]', err)
    res.status(500).json({
      message: 'Internal server error',
      internalError: true
    })
  })

  // shutdown
  // =

  app.close = cloud.close.bind(cloud)

  return app
}
