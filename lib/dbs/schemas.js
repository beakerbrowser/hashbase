const assert = require('assert')
const figures = require('figures')
const pump = require('pump')
const through = require('through2')

// constants
// =

const CURRENT_DB_VERSION = 2

// exported api
// =

class Schemas {
  constructor (cloud) {
    this.cloud = cloud
  }

  // basic ops
  // =

  async getDBVersion () {
    return new Promise((resolve, reject) => {
      this.cloud.db.get('db-version', (err, v) => {
        if (err && err.notFound) resolve(1) // default to 1
        else if (!err) resolve(+v)
        else reject(err)
      })
    })
  }

  async setDBVersion (v) {
    assert(typeof v === 'number')
    return new Promise((resolve, reject) => {
      this.cloud.db.put('db-version', v, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  // migrations
  // =

  async migrate () {
    var v = await this.getDBVersion()
    if (v >= CURRENT_DB_VERSION) {
      console.log(figures.tick, 'Database loaded at version', v)
      return
    }

    console.log(figures.pointerSmall, 'Running database migrations to bring version', v, 'to version', CURRENT_DB_VERSION)
    for (v; v < CURRENT_DB_VERSION; v++) {
      console.log(figures.pointerSmall, `v${v} migration started...`)
      await this[`to${v + 1}`]()
    }
    await this.setDBVersion(CURRENT_DB_VERSION)
    console.log(figures.tick, 'Database updated to version', v)
  }

  async to2 () {
    /**
    In V2, we had two changes around how archives work:

      1. Archive subdomains are no longer post-fixed by the username.
         An archive with the name 'foo' will be at 'foo.hashbase.io', not 'foo-bob.hashbase.io'.
      2. Archive records now record some "denormalized" data for performance.
         That data is their name, and their owner's name.

    At time of migration, we need to populate all of the denormalization fields, but also --

    #1 is a change to user-facing policy. To make the transition smooth, we rename all archives so
    that the new policy has no immediate effect. The previous policy was that an archive was hosted
    at 'archivename-username.hashbase.io' unless 'archivename' === 'username', in which case it was
    hosted at 'username.hashbase.io'. This leads us to the following rules:

      - If 'archivename' !== 'username', then 'archivename' = `${archivename}-${username}`
      - Else, then 'archivename' = 'archivename'

    **/
    return new Promise((resolve, reject) => {
      pump(
        // stream the users
        this.cloud.usersDB.accountsDB.createValueStream(),
        through.obj(async (userRecord, enc, cb) => {
          // sanity check
          if (!userRecord || !userRecord.archives || !Array.isArray(userRecord.archives)) {
            console.log('skipping bad user record', userRecord)
            return cb() // skip it
          }

          // iterate their archives
          for (let archive of userRecord.archives) {
            // update the name
            if (!archive.name || archive.name === userRecord.username) {
              // do nothing
            } else {
              // rename
              let oldName = archive.name
              archive.name = `${archive.name}-${userRecord.username}`
              console.log('setting', oldName, 'to', archive.name)
            }

            // update the archive record
            await this.cloud.archivesDB.update(archive.key, {
              name: archive.name,
              ownerName: userRecord.username
            })
          }

          // update the user record
          await this.cloud.usersDB.update(userRecord.id, userRecord)
          cb()
        }),
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })
  }
}
module.exports = Schemas
