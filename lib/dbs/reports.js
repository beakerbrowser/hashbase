var createIndexer = require('level-simple-indexes')
var levelPromise = require('level-promise')
var EventEmitter = require('events')
var assert = require('assert')
var sublevel = require('subleveldown')
var mtb36 = require('monotonic-timestamp-base36')
var collect = require('stream-collector')
var { promisifyModule } = require('../helpers')

// exported api
// =

class ReportsDB extends EventEmitter {
  constructor (cloud) {
    super()
    this.indexDB = sublevel(cloud.db, 'reports-index')

    // create levels and indexer
    this.reportsDB = sublevel(cloud.db, 'reports', { valueEncoding: 'json' })

    this.indexer = createIndexer(this.indexDB, {
      keyName: 'id',
      properties: ['archiveOwner', 'reportingUser', 'archiveKey'],
      map: (id, next) => {
        this.getByID(id)
          .catch(next)
          .then(res => next(null, res))
      }
    })

    // promisify
    levelPromise.install(this.reportsDB)
    levelPromise.install(this.indexDB)
    promisifyModule(this.indexer, ['findOne', 'addIndexes', 'removeIndexes', 'updateIndexes'])
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
    await this.indexer.updateIndexes(record)
    this.emit('put', record)
  }

  async del (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.id === 'string')
    await this.reportsDB.del(record.id)
    await this.indexer.removeIndexes(record)
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
      if (sort === 'archiveOwner') stream = this.indexer.find('archiveOwner', opts)
      else if (sort === 'reportingUser') stream = this.indexer.find('reportingUser', opts)
      else if (sort === 'archiveKey') stream = this.indexer.find('archiveKey', opts)
      else stream = this.reportsDB.createValueStream(opts)
      // collect into an array
      collect(stream, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
  }

  // getters

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
