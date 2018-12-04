const assert = require('assert')
const sublevel = require('subleveldown')

// exported api
// =

class FeaturedArchivesDB {
  constructor (db) {
    this.featuredDB = sublevel(db, 'featured-archives', { valueEncoding: 'json' })
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
}
module.exports = FeaturedArchivesDB
