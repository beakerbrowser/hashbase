var express = require('express')
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var expressValidator = require('express-validator')

var Hypercloud = require('./lib')
var customValidators = require('./lib/validators')
var customSanitizers = require('./lib/sanitizers')
var packageJson = require('./package.json')

module.exports = function (config) {
  var cloud = new Hypercloud(config)
  cloud.version = packageJson.version
  cloud.setupAdminUser()

  var app = express()
  app.cloud = cloud
  app.config = config

  app.locals = {
    session: false, // default session value
    errors: false, // common default value
    appInfo: {
      version: packageJson.version,
      brandname: config.brandname,
      hostname: config.hostname,
      port: config.port
    }
  }

  app.use(cookieParser())
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded())
  app.use(expressValidator({ customValidators, customSanitizers }))
  app.use(cloud.sessions.middleware())

  // service apis
  // =

  app.get('/', cloud.api.service.frontpage)
  app.get('/v1/explore', cloud.api.service.explore)

  // user & auth apis
  // =

  app.post('/v1/register', cloud.api.users.doRegister)
  app.get('/v1/verify', cloud.api.users.verify)
  app.post('/v1/verify', cloud.api.users.verify)
  app.get('/v1/account', cloud.api.users.getAccount)
  app.post('/v1/account', cloud.api.users.updateAccount)
  app.post('/v1/login', cloud.api.users.doLogin)
  app.get('/v1/logout', cloud.api.users.doLogout)
  app.get('/v1/users/:username([^/]{3,})', cloud.api.users.get)

  // archives apis
  // =

  app.post('/v1/archives/add', cloud.api.archives.add)
  app.post('/v1/archives/remove', cloud.api.archives.remove)
  app.get('/v1/archives/:key([0-9a-f]{64})', cloud.api.archives.get)
  app.get('/v1/users/:username([^/]{3,})/:archivename', cloud.api.archives.getByName)

  // admin apis
  // =

  app.get('/v1/admin/users', cloud.api.admin.listUsers)
  app.get('/v1/admin/users/:id', cloud.api.admin.getUser)
  app.post('/v1/admin/users/:id', cloud.api.admin.updateUser)
  app.post('/v1/admin/users/:id/suspend', cloud.api.admin.suspendUser)
  app.post('/v1/admin/users/:id/unsuspend', cloud.api.admin.unsuspendUser)

  // (json) error-handling fallback
  // =

  app.use((err, req, res, next) => {
    var contentType = req.accepts('json')
    if (!contentType) {
      return next()
    }

    // validation errors
    if ('isEmpty' in err) {
      return res.status(422).json({
        message: 'There were errors in your submission',
        invalidInputs: true,
        details: err.mapped()
      })
    }

    // common errors
    if ('status' in err) {
      res.status(err.status)
      res.json(err.body)
      return
    }

    // general uncaught error
    console.error('[ERROR]', err)
    res.status(500)
    var error = {
      message: 'Internal server error',
      internalError: true
    }
    res.json(error)
  })

  // ui module handlers
  // =

  if (config.ui) {
    app.use(require(config.ui)({cloud, config}))
  }

  // error handling
  // =

  process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason)
  })

  // shutdown
  // =

  app.close = cloud.close.bind(cloud)

  return app
}
