var EventEmitter = require('events')
var assert = require('assert')
var levelPromise = require('level-promise')
var createIndexer = require('level-simple-indexes')
var sublevel = require('subleveldown')
var collect = require('stream-collector')
var mtb36 = require('monotonic-timestamp-base36')
var { promisifyModule } = require('../helpers')

// exported api
// =

class DomainsDB extends EventEmitter {
  constructor (cloud) {
    super()

    // create levels and indexer
    this.domainsDB = sublevel(cloud.db, 'domains', { valueEncoding: 'json' })
    this.indexDB = sublevel(cloud.db, 'domains-index')
    this.indexer = createIndexer(this.indexDB, {
      keyName: 'id',
      properties: ['archiveKey', 'domain', 'userId'],
      map: (id, next) => {
        this.getByID(id)
          .catch(next)
          .then(res => next(null, res))
      }
    })

    // promisify
    levelPromise.install(this.domainsDB)
    promisifyModule(this.indexer, ['findOne', 'addIndexes', 'removeIndexes', 'updateIndexes'])
  }

  // basic ops
  // =

  async create (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.archiveKey === 'string')
    assert(typeof record.domain === 'string')
    assert(typeof record.userId === 'string')
    record = Object.assign({}, DomainsDB.defaults(), record)
    record.id = mtb36()
    record.createdAt = Date.now()
    await this.put(record)
    this.emit('create', record)
    return record
  }

  async put (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.id === 'string')
    assert(typeof record.archiveKey === 'string')
    assert(typeof record.domain === 'string')
    assert(typeof record.userId === 'string')
    record.updatedAt = Date.now()
    await this.domainsDB.put(record.id, record)
    await this.indexer.updateIndexes(record)
    this.emit('put', record)
  }

  async del (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.id === 'string')
    await this.domainsDB.del(record.id)
    await this.indexer.removeIndexes(record)
    this.emit('del', record)
  }

  // getters
  // =

  async getByID (id) {
    assert(typeof id === 'string')
    try {
      return await this.domainsDB.get(id)
    } catch (e) {
      if (e.notFound) return null
      throw e
    }
  }

  async getByDomainAndUserId (domain, userId) {
    let records = await this._listBy('domain', domain)
    return records.filter(r => r.userId === userId)[0]
  }

  async listByDomain (domain, opts) {
    assert(typeof domain === 'string')
    return this._listBy('domain', domain, opts)
  }

  async listByArchiveKey (archiveKey, opts) {
    assert(typeof archiveKey === 'string')
    return this._listBy('archiveKey', archiveKey, opts)
  }

  async listByUserId (userId, opts) {
    assert(typeof userId === 'string')
    return this._listBy('userId', userId, opts)
  }

  async _listBy (key, value, opts) {
    assert(typeof value === 'string')
    return new Promise((resolve, reject) => {
      // collect into an array
      collect(this.indexer.find(key, {lte: value, gte: value}), (err, res) => {
        if (err) reject(err)
        else {
          // apply filters
          if (opts && opts.verifiedOnly) {
            res = res.filter(r => r.isDomainVerified)
          }
          resolve(res)
        }
      })
    })
  }

  list ({cursor, limit, reverse, sort} = {}) {
    return new Promise((resolve, reject) => {
      var opts = {limit, reverse}
      if (typeof cursor !== 'undefined') {
        // set cursor according to reverse
        if (reverse) opts.lt = cursor
        else opts.gt = cursor
      }
      // fetch according to sort
      var stream
      if (sort) stream = this.indexer.find(sort, opts)
      else stream = this.domainsDB.createValueStream(opts)
      // collect into an array
      collect(stream, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
  }
}
module.exports = DomainsDB

// default user-record values
DomainsDB.defaults = () => ({
  id: null,

  archiveKey: null,
  domain: null,
  userId: null,

  isDomainVerified: false,
  domainVerifyNonce: null,

  updatedAt: 0,
  createdAt: 0
})
