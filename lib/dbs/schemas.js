const LegacyLeveldb = require('./legacy-leveldb')


// exported api
// =

class Schemas {
  constructor (cloud) {
    this.cloud = cloud
  }

  async runCorrections () {
    // none currently
  }

  async migrate () {
    await this.cloud.db.migrate({migrationsPath: './lib/dbs/migrations'})
    await LegacyLeveldb.migrateAsNeeded(this.cloud.config.dir)
  }
}
module.exports = Schemas
