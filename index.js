var express = require('express')
var bodyParser = require('body-parser')
var es6Renderer = require('express-es6-template-engine')
var expressValidator = require('express-validator')
var lessExpress = require('less-express')

var Hypercloud = require('./lib')
var customValidators = require('./lib/validators')
var customSanitizers = require('./lib/sanitizers')
var packageJson = require('./package.json')

module.exports = function (config) {
  var cloud = new Hypercloud(config)
  cloud.setupAdminUser()

  var app = express()
  app.cloud = cloud
  app.config = config

  app.locals = {
    partialPaths: {
      nav: './lib/templates/html/com/nav.html',
      footer: './lib/templates/html/com/footer.html',
      homeCTA: './lib/templates/html/com/home-cta.html'
    },
    session: false, // default session value
    appInfo: {
      version: packageJson.version,
      brandname: config.brandname,
      hostname: config.hostname,
      port: config.port
    }
  }

  app.engine('html', es6Renderer)
  app.set('views', './lib/templates/html')
  app.set('view engine', 'html')

  app.use(bodyParser.json())
  app.use(expressValidator({ customValidators, customSanitizers }))
  app.use(cloud.sessions.middleware())
 
  // user & auth apis
  // =

  app.post('/v1/register', cloud.api.users.register)
  app.get('/v1/verify', cloud.api.users.verify)
  app.post('/v1/verify', cloud.api.users.verify)
  app.get('/v1/account', cloud.api.users.getAccount)
  app.post('/v1/account', cloud.api.users.updateAccount)
  app.post('/v1/login', cloud.api.users.login)
  app.post('/v1/logout', cloud.api.users.logout)

  // archives apis
  // =

  app.post('/v1/archives/add', cloud.api.archives.add)
  app.post('/v1/archives/remove', cloud.api.archives.remove)

  // assets
  // =

  app.get('/assets/css/main.css', lessExpress('./lib/templates/css/main.less'))
  app.use('/assets/css', express.static('./lib/templates/css'))
  app.use('/assets/js', express.static('./lib/templates/js'))

  // 'frontend'
  // =

  app.get(/^\/[0-9a-f]{64}\/?$/, cloud.api.archives.get)
  app.get('/:username', cloud.api.users.get)
  app.get('/:username/:datname', cloud.api.archives.getByName)
  app.get('/', cloud.api.archives.frontpage)

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
