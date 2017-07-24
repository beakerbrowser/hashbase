const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const expressValidator = require('express-validator')
const RateLimit = require('express-rate-limit')
const csurf = require('csurf')
const vhost = require('vhost')
const bytes = require('bytes')
const lessExpress = require('less-express')
const ejs = require('ejs')

const Hypercloud = require('./lib')
const customValidators = require('./lib/validators')
const customSanitizers = require('./lib/sanitizers')
const analytics = require('./lib/analytics')
const packageJson = require('./package.json')

module.exports = function (config) {
  addConfigHelpers(config)
  var cloud = new Hypercloud(config)
  cloud.version = packageJson.version
  cloud.setupAdminUser()

  var app = express()
  app.cloud = cloud
  app.config = config
  app.approveDomains = approveDomains(config, cloud)

  app.locals = {
    session: false, // default session value
    sessionUser: false,
    errors: false, // common default value
    appInfo: {
      version: cloud.version,
      brandname: config.brandname,
      hostname: config.hostname,
      port: config.port,
      proDiskUsageLimit: config.proDiskUsageLimit
    }
  }

  app.engine('html', ejs.renderFile)
  app.engine('ejs', ejs.renderFile)
  app.set('view engine', 'html')
  app.set('views', path.join(__dirname, 'assets/html'))

  app.use(cookieParser())
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded())
  app.use(expressValidator({ customValidators, customSanitizers }))
  app.use(cloud.sessions.middleware())
  app.use(config.csrf ? csurf({cookie: true}) : fakeCSRF)
  if (config.rateLimiting) {
    app.use(new RateLimit({windowMs: 10e3, max: 100, delayMs: 0})) // general rate limit
    // app.use('/v1/verify', actionLimiter(24, 'Too many accounts created from this IP, please try again after an hour'))
    app.use('/v1/login', actionLimiter(1, 'Too many login attempts from this IP, please try again after an hour'))
  }

  // monitoring
  // =

  if (config.pm2) {
    let pmx = require('pmx')
    pmx.init({
      http: true, // HTTP routes logging (default: true)
      ignore_routes: [], // Ignore http routes with this pattern (Default: [])
      errors: true, // Exceptions logging (default: true)
      custom_probes: true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
      network: true, // Network monitoring at the application level
      ports: true  // Shows which ports your app is listening on (default: false)
    })
    require('./lib/monitoring').init(config, cloud, pmx)
  }

  // http gateway
  // =

  if (config.sites) {
    var httpGatewayApp = express()
    httpGatewayApp.get('/.well-known/dat', cloud.api.archiveFiles.getDNSFile)
    httpGatewayApp.get('*', cloud.api.archiveFiles.getFile)
    app.use(vhost('*.' + config.hostname, httpGatewayApp))
  }

  // assets
  // =

  app.get('/assets/css/main.css', lessExpress(path.join(__dirname, 'assets/css/main.less')))
  app.use('/assets/css', express.static(path.join(__dirname, 'assets/css')))
  app.use('/assets/js', express.static(path.join(__dirname, 'assets/js')))
  app.use('/assets/fonts', express.static(path.join(__dirname, 'assets/fonts')))
  app.use('/assets/images', express.static(path.join(__dirname, 'assets/images')))

  // ----------------------------------------------------------------------------------
  // add analytics for routes declared below here
  // ----------------------------------------------------------------------------------
  app.use(analytics.middleware(cloud))

  // service apis
  // =

  app.get('/', cloud.api.service.frontpage)
  app.get('/v1/explore', cloud.api.service.explore)

  // pages
  // =

  app.get('/', cloud.api.pages.frontpage)
  app.get('/explore', cloud.api.pages.explore)
  app.get('/new-archive', cloud.api.pages.newArchive)
  app.get('/about', cloud.api.pages.about)
  app.get('/pricing', cloud.api.pages.pricing)
  app.get('/terms', cloud.api.pages.terms)
  app.get('/privacy', cloud.api.pages.privacy)
  app.get('/acceptable-use', cloud.api.pages.acceptableUse)
  app.get('/support', cloud.api.pages.support)
  app.get('/login', cloud.api.pages.login)
  app.get('/forgot-password', cloud.api.pages.forgotPassword)
  app.get('/reset-password', cloud.api.pages.resetPassword)
  app.get('/register', cloud.api.pages.register)
  app.get('/register/pro', cloud.api.pages.registerPro)
  app.get('/registered', cloud.api.pages.registered)
  app.get('/profile', cloud.api.pages.profileRedirect)
  app.get('/account/upgrade', cloud.api.pages.accountUpgrade)
  app.get('/account/upgraded', cloud.api.pages.accountUpgraded)
  app.get('/account/cancel-plan', cloud.api.pages.accountCancelPlan)
  app.get('/account/canceled-plan', cloud.api.pages.accountCanceledPlan)
  app.get('/account/change-password', cloud.api.pages.accountChangePassword)
  app.get('/account/update-email', cloud.api.pages.accountUpdateEmail)
  app.get('/account', cloud.api.pages.account)

  // user pages
  // =

  app.get('/:username([a-z0-9]{3,})/:archivename([a-z0-9-]{3,})', cloud.api.userContent.viewArchive)
  app.get('/:username([a-z0-9]{3,})', cloud.api.userContent.viewUser)

  // user & auth apis
  // =

  app.post('/v1/register', cloud.api.users.doRegister)
  app.all('/v1/verify', cloud.api.users.verify)
  app.get('/v1/account', cloud.api.users.getAccount)
  app.post('/v1/account', cloud.api.users.updateAccount)
  app.post('/v1/account/password', cloud.api.users.updateAccountPassword)
  app.post('/v1/account/email', cloud.api.users.updateAccountEmail)
  app.post('/v1/account/upgrade', cloud.api.users.upgradePlan)
  app.post('/v1/account/register/pro', cloud.api.users.registerPro)
  app.post('/v1/account/update-card', cloud.api.users.updateCard)
  app.post('/v1/account/cancel-plan', cloud.api.users.cancelPlan)
  app.post('/v1/login', cloud.api.users.doLogin)
  app.get('/v1/logout', cloud.api.users.doLogout)
  app.post('/v1/forgot-password', cloud.api.users.doForgotPassword)
  app.get('/v1/users/:username([^/]{3,})', cloud.api.users.get)

  // archives apis
  // =

  app.post('/v1/archives/add', cloud.api.archives.add)
  app.post('/v1/archives/remove', cloud.api.archives.remove)
  app.get('/v1/archives/:key([0-9a-f]{64})', cloud.api.archives.get)
  app.get('/v1/users/:username([^/]{3,})/:archivename', cloud.api.archives.getByName)

  // reports apis
  app.post('/v1/reports/add', cloud.api.reports.add)

  // admin apis
  // =

  app.get('/v1/admin', cloud.api.admin.getDashboard)
  app.get('/v1/admin/users', cloud.api.admin.listUsers)
  app.get('/v1/admin/users/:id', cloud.api.admin.getUser)
  app.post('/v1/admin/users/:id', cloud.api.admin.updateUser)
  app.post('/v1/admin/users/:id/suspend', cloud.api.admin.suspendUser)
  app.post('/v1/admin/users/:id/unsuspend', cloud.api.admin.unsuspendUser)
  app.post('/v1/admin/users/:id/resend-email-confirmation', cloud.api.admin.resendEmailConfirmation)
  app.post('/v1/admin/users/:username/send-email', cloud.api.admin.sendEmail)
  app.post('/v1/admin/archives/:key/feature', cloud.api.admin.featureArchive)
  app.post('/v1/admin/archives/:key/unfeature', cloud.api.admin.unfeatureArchive)
  app.get('/v1/admin/archives/:key', cloud.api.admin.getArchive)
  app.post('/v1/admin/archives/:key/remove', cloud.api.admin.removeArchive)
  app.get('/v1/admin/analytics/events', cloud.api.admin.getAnalyticsEventsList)
  app.get('/v1/admin/analytics/events-count', cloud.api.admin.getAnalyticsEventsCount)
  app.get('/v1/admin/analytics/events-stats', cloud.api.admin.getAnalyticsEventsStats)
  app.get('/v1/admin/analytics/cohorts', cloud.api.admin.getAnalyticsCohorts)
  app.get('/v1/admin/reports', cloud.api.admin.getReports)
  app.get('/v1/admin/reports/:id', cloud.api.admin.getReport)
  app.post('/v1/admin/reports/:id', cloud.api.admin.updateReport)
  app.post('/v1/admin/reports/:id/close', cloud.api.admin.closeReport)
  app.post('/v1/admin/reports/:id/open', cloud.api.admin.openReport)

  // (json) error-handling fallback
  // =

  app.use((err, req, res, next) => {
    var contentType = req.accepts(['json', 'html'])
    if (!contentType) {
      return next()
    }

    // CSRF error
    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({
        message: 'The form has entered an invalid state. Please refresh and try submitting again. If this persists, please contact support.',
        badCSRF: true
      })
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
      if (contentType === 'json') {
        res.json(err.body)
      } else {
        res.render('error', { error: err })
      }
      return
    }

    // general uncaught error
    console.error('[ERROR]', err)
    res.status(500)
    var error = {
      message: 'Internal server error',
      internalError: true
    }
    if (contentType === 'json') {
      res.json(error)
    } else {
      res.render('error', { error })
    }
  })

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

function actionLimiter (perHour, message) {
  return new RateLimit({
    windowMs: perHour * 60 * 60 * 1000,
    delayMs: 0,
    max: 5, // start blocking after 5 requests
    message
  })
}

function addConfigHelpers (config) {
  config.getUserDiskQuota = (userRecord) => {
    return userRecord.diskQuota || bytes(config.defaultDiskUsageLimit)
  }
  config.getUserDiskQuotaPct = (userRecord) => {
    return userRecord.diskUsage / config.getUserDiskQuota(userRecord)
  }
}

function approveDomains (config, cloud) {
  return async (options, certs, cb) => {
    var {domain} = options
    options.agreeTos = true
    options.email = config.letsencrypt.email

    // toplevel domain?
    if (domain === config.hostname) {
      return cb(null, {options, certs})
    }

    // try looking up the site
    try {
      var archiveName
      var userName
      var domainParts = domain.split('.')
      if (config.sites === 'per-user') {
        // make sure the user record exists
        userName = domainParts[0]
        await cloud.usersDB.getByUsername(userName)
        return cb(null, {options, certs})
      } else if (config.sites === 'per-archive') {
        // make sure the user and archive records exists
        if (domainParts.length === 3) {
          userName = archiveName = domainParts[0]
        } else {
          archiveName = domainParts[0]
          userName = domainParts[1]
        }
        let userRecord = await cloud.usersDB.getByUsername(userName)
        let archiveRecord = userRecord.archives.find(a => a.name === archiveName)
        if (archiveRecord) {
          return cb(null, {options, certs})
        }
      }
    } catch (e) {}
    cb(new Error('Invalid domain'))
  }
}

function fakeCSRF (req, res, next) {
  req.csrfToken = () => 'csrf is disabled'
  next()
}
