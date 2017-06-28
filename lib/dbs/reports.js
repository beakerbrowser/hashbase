var EventEmitter = require('events')
var assert = require('assert')
var sublevel = require('subleveldown')
var mtb36 = require('monotonic-timestamp-base36')
var collect = require('stream-collector')

// exported api
// =

class ReportsDB extends EventEmitter {
  constructor (cloud) {
    super()
    this.config = cloud.config
    this.archiver = cloud.archiver
    this.usersDB = cloud.usersDB

    // create levels and indexer
    this.reportsDB = sublevel(cloud.db, 'reports', { valueEncoding: 'json' })
  }

  // basic ops
  // =

  async create (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.archiveKey === 'string')

    record = Object.assign({}, ReportsDB.defaults(), record)
    record.id = `${record.archiveKey}:${mtb36()}`
    record.createdAt = Date.now()

    await this.put(record)
    this.emit('create', record)
    return record
  }

  async put (record) {
    assert(typeof record.id === 'string')
    record.updatedAt = Date.now()
    await this.reportsDB.put(record.id, record)
    this.emit('put', record)
  }

  async del (record) {
    // TODO
    assert(record && typeof record === 'object')
    assert(typeof record.key === 'string')
    await this.archivesDB.del(record.key)
    await this.indexer.removeIndexes(record)
    /* dont await */ this.deadArchivesDB.del(record.key)
    this.emit('del', record)
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
      var stream
      // if (sort === 'username') stream = this.indexer.find('username', opts)
      // else if (sort === 'email') stream = this.indexer.find('email', opts)
      // else stream = this.reportsDB.createValueStream(opts)
      stream = this.reportsDB.createValueStream(opts)
      // collect into an array
      collect(stream, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
  }
}

module.exports = ReportsDB

// default user-record values
ReportsDB.defaults = () => ({
  archiveKey: null,

  archiveOwner: null,
  reportingUser: null,

  reason: null,
  status: 'open',
  notes: null,

  createdAt: 0
})
