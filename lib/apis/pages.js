const nicedate = require('nicedate')
const bytes = require('bytes')
const {ForbiddenError} = require('../const')
const {pluralize, ucfirst} = require('../helpers')

// exported api
// =

class PagesAPI {
  constructor (cloud) {
    this.cloud = cloud
    this.config = cloud.config
  }

  async frontpage (req, res) {
    var user = res.locals.sessionUser
    var diskUsage = user ? user.diskUsage : undefined
    var diskQuota = user ? this.config.getUserDiskQuota(user) : undefined

    var [featured, recent, popular] = await Promise.all([
      this.cloud.featuredArchivesDB.list(),
      this.cloud.archivesDB.list({
        sort: 'createdAt',
        reverse: true,
        limit: 25
      }),
      (user && user.scopes.includes('admin:dats'))
        ? this.cloud.archivesDB.list({
          sort: 'popular',
          limit: 25
        })
        : false
    ])
    var userArchives = []
    if (user) {
      userArchives = await Promise.all(user.archives.map(async (record) => {
        var archive = this.cloud.archiver.archives[record.key]
        record.manifest = await this.cloud.archiver.getManifest(archive.key)
        record.title = record.manifest ? record.manifest.title : false
        record.numPeers = archive.numPeers
        record.diskUsage = await this.cloud.archiver.getArchiveDiskUsage(archive.key)
        return record
      }))
      console.log(userArchives)
    }

    res.render('frontpage', {
      verified: req.query.verified,
      userArchives,
      nicedate,
      featured,
      popular,
      recent,
      bytes,
      diskUsage,
      diskQuota
    })
  }

  async explore (req, res) {
    if (req.query.view === 'activity') {
      return res.render('explore-activity', {
        nicedate,
        activityLimit: 25,
        activity: await this.cloud.activityDB.listGlobalEvents({
          limit: 25,
          lt: req.query.start,
          reverse: true
        })
      })
    }
    var users = await this.cloud.usersDB.list()
    res.render('explore', {users})
  }

  async newArchive (req, res) {
    var {session, sessionUser} = res.locals
    if (!session) res.redirect('/login?redirect=new-archive')

    res.render('new-archive', {
      diskUsage: (sessionUser.diskUsage / (1 << 20)) | 0,
      diskQuota: (this.config.getUserDiskQuota(sessionUser) / (1 << 20)) | 0
    })
  }

  about (req, res) {
    res.render('about')
  }

  pricing (req, res) {
    res.render('pricing')
  }

  terms (req, res) {
    res.render('terms')
  }

  privacy (req, res) {
    res.render('privacy')
  }

  acceptableUse (req, res) {
    res.render('acceptable-use')
  }

  support (req, res) {
    res.render('support')
  }

  login (req, res) {
    res.render('login', {
      reset: req.query.reset // password reset
    })
  }

  forgotPassword (req, res) {
    res.render('forgot-password')
  }

  resetPassword (req, res) {
    // basic check for nonce and username queries
    if (!(req.query.nonce && req.query.username)) throw new ForbiddenError()

    res.render('reset-password')
  }

  register (req, res) {
    res.render('register', {
      isOpen: this.config.registration.open,
      isProSignup: req.query.pro
    })
  }

  registerPro (req, res) {
    // basic check for user ID and email
    if (!(req.query.id && req.query.email)) throw new ForbiddenError()

    res.render('register-pro', {
      id: req.query.id,
      email: req.query.email,
      stripePK: this.config.stripe.publishableKey
    })
  }

  registered (req, res) {
    res.render('registered', {email: req.query.email})
  }

  async profileRedirect (req, res) {
    var {sessionUser} = res.locals
    if (sessionUser) {
      res.redirect(`/${sessionUser.username}`)
    } else {
      res.redirect('/')
    }
  }

  async account (req, res) {
    var {session, sessionUser} = res.locals
    if (!session) return res.redirect('/login?redirect=account')
    res.render('account', {
      stripePK: this.config.stripe.publishableKey,
      updated: req.query.updated,
      ucfirst,
      pluralize,
      diskUsage: (sessionUser.diskUsage / (1 << 20)) | 0,
      diskQuota: (this.config.getUserDiskQuota(sessionUser) / (1 << 20)) | 0,
      diskUsagePct: (this.config.getUserDiskQuotaPct(sessionUser) * 100) | 0
    })
  }

  async accountUpgrade (req, res) {
    var {session} = res.locals
    if (!session) return res.redirect('/login?redirect=account/upgrade')
    res.render('account-upgrade', {stripePK: this.config.stripe.publishableKey})
  }

  async accountUpgraded (req, res) {
    var {session} = res.locals
    if (!session) throw new ForbiddenError()
    res.render('account-upgraded')
  }

  async accountCancelPlan (req, res) {
    var {session} = res.locals
    if (!session) throw new ForbiddenError()
    res.render('account-cancel-plan')
  }

  async accountCanceledPlan (req, res) {
    var {session} = res.locals
    if (!session) throw new ForbiddenError()
    res.render('account-canceled-plan')
  }

  async accountChangePassword (req, res) {
    res.render('account-change-password')
  }

  accountUpdateEmail (req, res) {
    var {session} = res.locals
    if (!session) throw new ForbiddenError()
    res.render('account-update-email')
  }
}

module.exports = PagesAPI
