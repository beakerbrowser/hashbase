var EventEmitter = require('events')
var assert = require('assert')
var sublevel = require('subleveldown')
var collect = require('stream-collector')

// exported api
// =

class ReportsDB extends EventEmitter {
  constructor (db) {
    super()
    this.reportsDB = sublevel(db, 'reports', { valueEncoding: 'json' })
  }

  // getters
  // =

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
      var stream = this.reportsDB.createValueStream(opts)
      // collect into an array
      collect(stream, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
  }

  async getByID (id) {
    assert(typeof id === 'string')
    try {
      return await this.reportsDB.get(id)
    } catch (e) {
      if (e.notFound) return null
      throw e
    }
  }
}

module.exports = ReportsDB

// default user-record values
ReportsDB.defaults = () => ({
  archiveKey: null,

  archiveOwner: null,
  reportingUser: null,

  reason: '',
  status: 'open',
  notes: '',

  createdAt: 0
})
