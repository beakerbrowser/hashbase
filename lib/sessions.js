var jwt = require('jsonwebtoken')
var pify = require('pify')

// promisify
jwt.verify = pify(jwt.verify)

const DEFAULTS = {
  algorithm: 'HS256', // hmac sha256
  expiresIn: '1h'
}

// exported api
// =

module.exports = class Sessions {
  constructor(config) {
    this.options = Object.assign({}, DEFAULTS, {
      algorithm: config.sessions.algorithm,
      expiresIn: config.sessions.exporesIn
    })
    this.secret = config.sessions.secret
    assert(this.secret, 'config.sessions.secret is required')
  }

  async middleware() {
    return (req, res, next) => {
      // pull token out of header
      var authHeader = req.header('authorization')
      if (authHeader && authHeader.indexOf('Bearer') > -1) {
        req.session = await this.verify(authHeader.slice('Bearer '.length))
      }
      next()
    }
  }

  async verify(token) {
    try {
      // return decoded session or null on failure
      return await jwt.verify(token, this.secret, { algorithms: [this.options.algorithm] })
    } catch (e) {
      return null
    }
  }

  generate(userRecord) {
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