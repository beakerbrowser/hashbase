var assert = require('assert')
var jwt = require('jsonwebtoken')

// exported api
// =

module.exports = class Proofs {
  constructor (config) {
    this.secret = config.proofs.secret
    this.options = config.proofs
    delete this.options.secret
    assert(this.secret, 'config.proofs.secret is required')
    assert(this.options.algorithm, 'config.sessions.algorithm is required')
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
        profileURL: userRecord.profileURL
      },
      this.secret,
      { algorithm: this.options.algorithm }
    )
  }
}
