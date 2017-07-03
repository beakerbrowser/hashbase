const assert = require('assert')
const levelPromise = require('level-promise')
const sublevel = require('subleveldown')
const collect = require('stream-collector')

// exported api
// =

class FeaturedArchivesDB {
  constructor (cloud) {
    // create levels and indexer
    this.archivesDB = cloud.archivesDB
    this.featuredDB = sublevel(cloud.db, 'featured-archives', { valueEncoding: 'json' })

    // promisify
    levelPromise.install(this.featuredDB)

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

  async add (key) {
    assert(typeof key === 'string')
    await this.featuredDB.put(key, null)
  }

  async remove (key) {
    assert(typeof key === 'string')
    await this.featuredDB.del(key)
  }

  // getters
  // =

  async has (key) {
    assert(typeof key === 'string')
    try {
      await this.featuredDB.get(key)
      return true // if it doesnt fail, the key exists
    } catch (e) {
      return false
    }
  }

  async list () {
    var keys = await new Promise((resolve, reject) => {
      collect(this.featuredDB.createKeyStream(), (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
    var archives = await Promise.all(keys.map(key => (
      this.archivesDB.getExtraByKey(key)
    )))
    archives.sort(sortByPeerCount)
    return archives
  }
}
module.exports = FeaturedArchivesDB

function sortByPeerCount (a, b) {
  return b.numPeers - a.numPeers
}
