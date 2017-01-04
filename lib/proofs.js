var jwt = require('jsonwebtoken')
var pify = require('pify')

// promisify
jwt.verify = pify(jwt.verify)

const DEFAULTS = {
  algorithm: 'HS256' // hmac sha256
}

// exported api
// =

module.exports = class Proofs {
  constructor(config) {
    this.options = Object.assign({}, DEFAULTS, {
      algorithm: config.proofs.algorithm
    })
    this.secret = config.proofs.secret
    assert(this.secret, 'config.proofs.secret is required')
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
        profileURL: userRecord.profileURL
      },
      this.secret,
      { algorithm: this.options.algorithm }
    )
  }
}