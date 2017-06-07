const assert = require('assert')
const jwt = require('jsonwebtoken')
const wrap = require('co-express')

// TODO s/sessionAccount/sessionUser/

// exported api
// =

module.exports = class Sessions {
  constructor (cloud) {
    this.config = cloud.config
    this.options = cloud.config.sessions
    this.secret = cloud.config.sessions.secret
    this.usersDB = cloud.usersDB
    delete this.options.secret
    assert(this.secret, 'config.sessions.secret is required')
    assert(this.options.algorithm, 'config.sessions.algorithm is required')
  }

  middleware () {
    return wrap(async (req, res, next) => {
      res.locals.sessionAlerts = []

      // pull token out of auth or cookie header
      var authHeader = req.header('authorization')
      if (authHeader && authHeader.indexOf('Bearer') > -1) {
        res.locals.session = this.verify(authHeader.slice('Bearer '.length))
      } else if (req.cookies && req.cookies.sess) {
        res.locals.session = this.verify(req.cookies.sess)
      }

      // fetch user record if there's a session
      if (res.locals.session) {
        var sessionUser = await this.usersDB.getByID(res.locals.session.id)
        if (!sessionUser) {
          return next()
        }
        res.locals.sessionUser = sessionUser

        // add any alerts
        var pct = this.config.getUserDiskQuotaPct(sessionUser)
        if (pct > 1) {
          res.locals.sessionAlerts.push({
            type: 'warning',
            message: 'You are out of disk space!',
            details: 'Click here to review your account.',
            href: '/account'
          })
        } else if (pct > 0.9) {
          res.locals.sessionAlerts.push({
            type: '',
            message: 'You are almost out of disk space!',
            details: 'Click here to review your account.',
            href: '/account'
          })
        }
      }
      next()
    })
  }

  verify (token) {
    try {
      // return decoded session or null on failure
      return jwt.verify(token, this.secret, { algorithms: [this.options.algorithm] })
    } catch (e) {
      return null
    }
  }

  generate (userRecord) {
    return jwt.sign(
      {
        id: userRecord.id,
        scopes: userRecord.scopes
      },
      this.secret,
      this.options
    )
  }
}
