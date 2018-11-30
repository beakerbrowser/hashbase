var assert = require('assert')
var sublevel = require('subleveldown')
var collect = require('stream-collector')
var EventEmitter = require('events')

// exported api
// =

class UsersDB extends EventEmitter {
  constructor (db) {
    super()
    this.accountsDB = sublevel(db, 'accounts', { valueEncoding: 'json' })
  }

  // getters
  // =

  async getByID (id) {
    assert(typeof id === 'string')
    try {
      return await this.accountsDB.get(id)
    } catch (e) {
      if (e.notFound) return null
      throw e
    }
  }

  list ({cursor, limit, reverse, sort} = {}) {
    return new Promise((resolve, reject) => {
      var opts = {limit, reverse}
      // find indexes require a start- and end-point
      if (sort && sort !== 'id') {
        if (reverse) {
          opts.lt = cursor || '\xff'
          opts.gte = '\x00'
        } else {
          opts.gt = cursor || '\x00'
          opts.lte = '\xff'
        }
      } else if (typeof cursor !== 'undefined') {
        // set cursor according to reverse
        if (reverse) opts.lt = cursor
        else opts.gt = cursor
      }
      // fetch according to sort
      var stream = this.accountsDB.createValueStream(opts)
      // collect into an array
      collect(stream, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
  }

  createValueStream (opts) {
    return this.accountsDB.createValueStream(opts)
  }
}
module.exports = UsersDB

// default user-record values
UsersDB.defaults = () => ({
  username: null,
  passwordHash: null,
  passwordSalt: null,

  email: null,
  profileURL: null,
  scopes: [],
  suspension: null,
  archives: [],
  updatedAt: 0,
  createdAt: 0,

  plan: 'basic',
  diskUsage: 0,

  diskQuota: null,
  namedArchiveQuota: undefined,

  isEmailVerified: false,
  emailVerifyNonce: null,

  forgotPasswordNonce: null,

  isProfileDatVerified: false,
  profileVerifyToken: null,

  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripeTokenId: null,
  stripeCardId: null,
  stripeCardBrand: null,
  stripeCardCountry: null,
  stripeCardCVCCheck: null,
  stripeCardExpMonth: null,
  stripeCardExpYear: null,
  stripeCardLast4: null
})

// default user-record archive values
UsersDB.archiveDefaults = () => ({
  key: null,
  name: null
})
