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

  if (config.proxy) {
    app.set('trust proxy', 'loopback')
  }
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
  app.set('view engine', 'html')
  app.set('views', path.join(__dirname, 'assets/html'))

  var defaultApp = express()
  defaultApp.locals = app.locals
  defaultApp.engine('html', ejs.renderFile)
  defaultApp.engine('ejs', ejs.renderFile)
  defaultApp.set('view engine', 'html')
  defaultApp.set('views', path.join(__dirname, 'assets/html'))

  defaultApp.use(cookieParser())
  defaultApp.use(bodyParser.json())
  defaultApp.use(expressValidator({ customValidators, customSanitizers }))
  defaultApp.use(cloud.sessions.middleware())
  if (config.rateLimiting) {
    defaultApp.use(new RateLimit({windowMs: 10e3, max: 100, delayMs: 0})) // general rate limit
    // defaultApp.use('/v1/verify', actionLimiter(24, 'Too many accounts created from this IP, please try again after an hour'))
    defaultApp.use('/v1/login', actionLimiter(60 * 60 * 1000, 5, 'Too many login attempts from this IP, please try again after an hour'))
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

  // assets
  // =

  defaultApp.get('/assets/css/main.css', lessExpress(path.join(__dirname, 'assets/css/main.less')))

  // css for individual pages
  defaultApp.get('/assets/css/about.css', lessExpress(path.join(__dirname, 'assets/css/pages/about.less')))
  defaultApp.get('/assets/css/account.css', lessExpress(path.join(__dirname, 'assets/css/pages/account.less')))
  defaultApp.get('/assets/css/admin-dashboard.css', lessExpress(path.join(__dirname, 'assets/css/pages/admin-dashboard.less')))
  defaultApp.get('/assets/css/archive.css', lessExpress(path.join(__dirname, 'assets/css/pages/archive.less')))
  defaultApp.get('/assets/css/error.css', lessExpress(path.join(__dirname, 'assets/css/pages/error.less')))
  defaultApp.get('/assets/css/home.css', lessExpress(path.join(__dirname, 'assets/css/pages/home.less')))
  defaultApp.get('/assets/css/pricing.css', lessExpress(path.join(__dirname, 'assets/css/pages/pricing.less')))
  defaultApp.get('/assets/css/profile.css', lessExpress(path.join(__dirname, 'assets/css/pages/profile.less')))
  defaultApp.get('/assets/css/support.css', lessExpress(path.join(__dirname, 'assets/css/pages/support.less')))

  defaultApp.use('/assets/css', express.static(path.join(__dirname, 'assets/css')))
  defaultApp.use('/assets/js', express.static(path.join(__dirname, 'assets/js')))
  defaultApp.use('/assets/fonts', express.static(path.join(__dirname, 'assets/fonts')))
  defaultApp.use('/assets/images', express.static(path.join(__dirname, 'assets/images')))

  // ----------------------------------------------------------------------------------
  // add analytics for routes declared below here
  // ----------------------------------------------------------------------------------
  defaultApp.use(analytics.middleware(cloud))

  // Create separater router for API
  const api = createApiRouter(cloud)

  // Use api routes before applying csurf middleware
  defaultApp.use('/v1', api)

  // Then apply csurf
  defaultApp.use(config.csrf ? csurf({cookie: true}) : fakeCSRF)

  // service apis
  // =

  defaultApp.get('/', cloud.api.service.frontpage)
  defaultApp.get('/v1/explore', cloud.api.service.explore)

  // pages
  // =

  defaultApp.get('/', cloud.api.pages.frontpage)
  defaultApp.get('/explore', cloud.api.pages.explore)
  defaultApp.get('/new-archive', cloud.api.pages.newArchive)
  defaultApp.get('/about', cloud.api.pages.about)
  defaultApp.get('/pricing', cloud.api.pages.pricing)
  defaultApp.get('/terms', cloud.api.pages.terms)
  defaultApp.get('/privacy', cloud.api.pages.privacy)
  defaultApp.get('/acceptable-use', cloud.api.pages.acceptableUse)
  defaultApp.get('/support', cloud.api.pages.support)
  defaultApp.get('/login', cloud.api.pages.login)
  defaultApp.get('/forgot-password', cloud.api.pages.forgotPassword)
  defaultApp.get('/reset-password', cloud.api.pages.resetPassword)
  defaultApp.get('/register', cloud.api.pages.register)
  defaultApp.get('/register/pro', cloud.api.pages.registerPro)
  defaultApp.get('/registered', cloud.api.pages.registered)
  defaultApp.get('/profile', cloud.api.pages.profileRedirect)
  defaultApp.get('/account/upgrade', cloud.api.pages.accountUpgrade)
  defaultApp.get('/account/upgraded', cloud.api.pages.accountUpgraded)
  defaultApp.get('/account/cancel-plan', cloud.api.pages.accountCancelPlan)
  defaultApp.get('/account/canceled-plan', cloud.api.pages.accountCanceledPlan)
  defaultApp.get('/account/change-password', cloud.api.pages.accountChangePassword)
  defaultApp.get('/account/update-email', cloud.api.pages.accountUpdateEmail)
  defaultApp.get('/account', cloud.api.pages.account)

  // user pages
  // =

  defaultApp.get('/:username([a-z0-9]{3,})/:archivename([a-z0-9-]{3,})', cloud.api.userContent.viewArchive)
  defaultApp.get('/:username([a-z0-9]{3,})', cloud.api.userContent.viewUser)

  // (json) error-handling fallback
  // =

  defaultApp.use((err, req, res, next) => {
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
        try {
          res.render('error.html', { error: err })
        } catch (e) {
          // HACK
          // I cant figure out why res.render() fails sometimes
          // something about the view engine?
          // fallback to json and report the issue
          // -prf
          if (config.pm2) {
            require('pmx').emit('debug:view-render-error', {
              wasRendering: err,
              threwThis: e
            })
          }
          res.json(err.body)
        }
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

  app.use(vhost(config.hostname, defaultApp))

  app.get('/.well-known/dat', cloud.api.archiveFiles.getDNSFile)
  app.get('*', cloud.api.archiveFiles.getFile)

  app.use((err, req, res, next) => {
    if (err) {
      res.json(err.body || err)
    } else {
      next()
    }
  })

  app.close = cloud.close.bind(cloud)

  return app
}

function createApiRouter (cloud) {
  const router = new express.Router()

  // user & auth apis
  // =

  router.use(cloud.config.csrf ? csurf({cookie: true}) : fakeCSRF)

  router.post('/register', cloud.api.users.doRegister)
  router.all('/verify', cloud.api.users.verify)
  router.get('/account', cloud.api.users.getAccount)
  router.post('/account', cloud.api.users.updateAccount)
  router.post('/account/password', cloud.api.users.updateAccountPassword)
  router.post('/account/email', cloud.api.users.updateAccountEmail)
  router.post('/account/upgrade', cloud.api.users.upgradePlan)
  router.post('/account/register/pro', cloud.api.users.registerPro)
  router.post('/account/update-card', cloud.api.users.updateCard)
  router.post('/account/cancel-plan', cloud.api.users.cancelPlan)
  router.post('/login', cloud.api.users.doLogin)
  router.get('/logout', cloud.api.users.doLogout)
  router.post('/forgot-password', cloud.api.users.doForgotPassword)
  router.get('/users/:username([^/]{3,})', cloud.api.users.get)

  // archives apis
  // =

  router.post('/archives/add', cloud.api.archives.add)
  router.post('/archives/remove', cloud.api.archives.remove)
  router.get('/archives/:key([0-9a-f]{64})', cloud.api.archives.get)
  router.get('/users/:username([^/]{3,})/:archivename', cloud.api.archives.getByName)

  // reports apis
  router.post('/reports/add', cloud.api.reports.add)

  // admin apis
  // =

  router.get('/admin', cloud.api.admin.getDashboard)
  router.get('/admin/users', cloud.api.admin.listUsers)
  router.get('/admin/users/:id', cloud.api.admin.getUser)
  router.post('/admin/users/:id', cloud.api.admin.updateUser)
  router.post('/admin/users/:id/suspend', cloud.api.admin.suspendUser)
  router.post('/admin/users/:id/unsuspend', cloud.api.admin.unsuspendUser)
  router.post('/admin/users/:id/resend-email-confirmation', cloud.api.admin.resendEmailConfirmation)
  router.post('/admin/users/:username/send-email', cloud.api.admin.sendEmail)
  router.post('/admin/archives/:key/feature', cloud.api.admin.featureArchive)
  router.post('/admin/archives/:key/unfeature', cloud.api.admin.unfeatureArchive)
  router.post('/admin/archives/:key/domain', cloud.api.archives.addCustomDomain)
  router.post('/admin/archives/:key/removedomain', cloud.api.archives.removeCustomDomain)
  router.get('/admin/archives/:key', cloud.api.admin.getArchive)
  router.post('/admin/archives/:key/remove', cloud.api.admin.removeArchive)
  router.get('/admin/analytics/events', cloud.api.admin.getAnalyticsEventsList)
  router.get('/admin/analytics/events-count', cloud.api.admin.getAnalyticsEventsCount)
  router.get('/admin/analytics/events-stats', cloud.api.admin.getAnalyticsEventsStats)
  router.get('/admin/analytics/cohorts', cloud.api.admin.getAnalyticsCohorts)
  router.get('/admin/reports', cloud.api.admin.getReports)
  router.get('/admin/reports/:id', cloud.api.admin.getReport)
  router.post('/admin/reports/:id', cloud.api.admin.updateReport)
  router.post('/admin/reports/:id/close', cloud.api.admin.closeReport)
  router.post('/admin/reports/:id/open', cloud.api.admin.openReport)

  return router
}
function actionLimiter (windowMs, max, message) {
  return new RateLimit({
    windowMs,
    delayMs: 0,
    max,
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
    if (config.customdomains && config.customdomains[domain]) {
      return cb(null, {options, certs})
    }

    // try looking up the site
    if (domain.indexOf(config.hostname)) {
      try {
        var archiveName
        var userName
        var domainParts = domain.replace(/-/g, '.').split('.')
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
    }

    var archive = await cloud.customDomainsDB.getByDomain(domain)
    if (archive) {
      if (!config.customdomains) {
        config.customdomains = {}
      }
      config.customdomains[domain] = archive
      return cb(null, {options, certs})
    }
    cb(new Error('Invalid domain'))
  }
}

function fakeCSRF (req, res, next) {
  req.csrfToken = () => 'csrf is disabled'
  next()
}
