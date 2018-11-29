
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
  }
}
module.exports = Schemas
