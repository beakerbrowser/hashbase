const assert = require('assert')
const levelPromise = require('level-promise')
var createIndexer = require('level-simple-indexes')
const sublevel = require('subleveldown')
const collect = require('stream-collector')
var { promisifyModule } = require('../helpers')

// exported api
// =

class CustomDomainsDB {
  constructor (cloud) {
    // create levels and indexer

    this.archivesDB = cloud.archivesDB
    this.indexDB = sublevel(cloud.db, 'custom-domains-index')
    this.customDomainsDB = sublevel(cloud.db, 'custom-domains', { valueEncoding: 'json' })

    this.indexer = createIndexer(this.indexDB, {
      keyName: 'key',
      properties: ['domain'],
      map: (key, next) => {
        this.getByKey(key)
          .catch(next)
          .then(res => next(null, res))
      }
    })

    // promisify
    levelPromise.install(this.customDomainsDB)
    levelPromise.install(this.indexDB)
    promisifyModule(this.indexer, ['findOne', 'addIndexes', 'removeIndexes', 'updateIndexes'])

    // connect to archives emitters
    cloud.archivesDB.on('del', this.onArchiveDel.bind(this))
  }

  // event handlers
  //

  onArchiveDel (record) {
    this.remove(record.key)
  }

  // basic ops
  // =

  async add (record) {
    assert(typeof record.key === 'string')
    assert(typeof record.domain === 'string')
    await this.customDomainsDB.put(record.key, record)
    await this.indexer.updateIndexes(record)
  }

  async remove (key) {
    assert(typeof key === 'string')
    await this.customDomainsDB.del(key)
  }

  // getters
  // =

  async getByKey (key) {
    assert(typeof key === 'string')
    try {
      return await this.customDomainsDB.get(key)
    } catch (e) {
      if (e.notFound) return null
      throw e
    }
  }

  async getByDomain (domain) {
    assert(typeof domain === 'string')
    return this.indexer.findOne('domain', domain)
  }

  async getDomain (key) {
    var record = await this.getByKey(key)
    return record ? record.domain : null
  }

  async has (key) {
    assert(typeof key === 'string')
    try {
      await this.customDomainsDB.get(key)
      return true // if it doesnt fail, the key exists
    } catch (e) {
      return false
    }
  }

  async list () {
    var keys = await new Promise((resolve, reject) => {
      collect(this.customDomainsDB.createValueStream(), (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
    return keys
  }
}
module.exports = CustomDomainsDB
