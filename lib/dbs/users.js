var assert = require('assert')
var monotonicTimestamp = require('monotonic-timestamp')
var EventEmitter = require('events')
var moment = require('moment')
var SQL = require('sql-template-strings')
const {
  COHORT_STATE_REGISTERED,
  COHORT_STATE_ACTIVATED,
  COHORT_STATE_ACTIVE
} = require('../const')

// exported api
// =

class UsersDB extends EventEmitter {
  constructor (cloud) {
    super()
    this.cloud = cloud
    this.sqlite = cloud.db
  }

  // basic ops
  // =

  async create (record) {
    assert(record && typeof record === 'object')
    let id = monotonicTimestamp().toString(36)
    let {username, email, passwordHash, passwordSalt, emailVerificationNonce} = record
    await this.sqlite.run(SQL`
      INSERT INTO users
          (id, username, email, passwordHash, passwordSalt, emailVerificationNonce)
        VALUES
          (${id}, ${username}, ${email}, ${passwordHash}, ${passwordSalt}, ${emailVerificationNonce})
    `)
    this.emit('create', record)
    return record
  }

  async put (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.id === 'string')
    record.updatedAt = Date.now()

    var query = SQL`UPDATE users SET`
    for (let k in record) {
      if (k === 'id') continue
      query.append(SQL` ${k} = ${record[k]}`)
    }
    query.append(SQL` WHERE id = ${record.id}`)
    await this.sqlite.run(query)

    this.emit('put', record)
  }

  async update (id, updates) {
    assert(updates && typeof updates === 'object')
    return this.put(Object.assign({id}, updates))
  }

  async del (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.id === 'string')
    await this.sqlite.run(SQL`DELETE FROM users WHERE id = ${record.id}`)
  }

  // getters
  // =

  _getArchives (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.id === 'string')
    return this.sqlite.all(SQL`SELECT * FROM users_archives WHERE userid = ${record.id}`)
  }

  async isEmailTaken (email) {
    var record = await this.getByEmail(email)
    return !!record
  }

  async isUsernameTaken (username) {
    var record = await this.getByUsername(username)
    return !!record
  }

  async getByID (id) {
    assert(typeof id === 'string')
    var record = await this.sqlite.get(SQL`SELECT * FROM users WHERE id = ${id}`)
    record.archives = this._getArchives(record)
    return record
  }

  async getByEmail (email) {
    assert(typeof email === 'string')
    var record = await this.sqlite.get(SQL`SELECT * FROM users WHERE email = ${email}`)
    record.archives = this._getArchives(record)
    return record
  }

  async getByUsername (username) {
    assert(typeof username === 'string')
    var record = await this.sqlite.get(SQL`SELECT * FROM users WHERE username = ${username}`)
    record.archives = this._getArchives(record)
    return record
  }

  async getByProfileURL (profileURL) {
    assert(typeof profileURL === 'string')
    var record = await this.sqlite.get(SQL`SELECT * FROM users WHERE profileURL = ${profileURL}`)
    record.archives = this._getArchives(record)
    return record
  }

  async list ({cursor, limit, reverse, sort} = {}) {
    // construct query
    var query = SQL`SELECT * FROM users`
    sort = sort || 'id'
    if (cursor) {
      if (reverse) query.append(SQL` WHERE ${sort} < ${cursor}`)
      else query.append(SQL` WHERE ${sort} > ${cursor}`)
    }
    query.append(SQL` ORDER BY ${sort}`)
    if (reverse) query.append(SQL` DESC`)
    if (limit) query.append(SQL` LIMIT ${limit}`)

    // run query and attach additional data
    var users = await this.sqlite.all(query)
    return Promise.all(users.map(async (user) => {
      user.archives = await this._getArchives(user)
      return user
    }))
  }

  // highlevel updates
  // =

  async onAddArchive (userId, archiveKey, name) {
    // update disk usage
    var userRecord = await this.getByID(userId)
    var archive = this.cloud.archiver.getArchive(archiveKey)
    if (archive && archive.diskUsage) {
      userRecord.diskUsage += archive.diskUsage
      await this.put(userRecord)
    }

    this.emit('add-archive', {userId, archiveKey, name}, userRecord)
  }

  async onRemoveArchive (userId, archiveKey) {
    // update disk usage
    var userRecord = await this.getByID(userId)
    var archive = this.cloud.archiver.getArchive(archiveKey)
    if (archive && archive.diskUsage) {
      userRecord.diskUsage -= archive.diskUsage
      await this.put(userRecord)
      /* dont await */ this.cloud.archiver.computeUserDiskUsageAndSwarm(userRecord)
    }
    this.emit('remove-archive', {userId, archiveKey}, userRecord)
  }

  // analytics
  // =

  getUserCohort (user) {
    assert(user && typeof user === 'object')
    assert(user.createdAt)
    var d = moment(user.createdAt)
    return d.format('YYYYWW')
  }

  async updateCohort (user, state) {
    return this.cloud.analytics.updateCohort('active_users', {
      subject: user.id,
      cohort: this.getUserCohort(user),
      state
    })
  }

  async computeCohorts () {
    var now = Date.now()
    var twoWeeks = moment.duration(2, 'weeks')

    // compute all records
    var records = await this.list()
    for (let record of records) {
      let state = COHORT_STATE_REGISTERED

      // active?
      if (record.archives.length) {
        state = COHORT_STATE_ACTIVATED

        // active in the last 2 weeks?
        for (var i = 0; i < record.archives.length; i++) {
          var mtime = await this.cloud.archiver.getArchiveMtime(record.archives[i].key)
          if (mtime && (now - mtime) <= twoWeeks) {
            state = COHORT_STATE_ACTIVE
            break
          }
        }
      }

      // update
      await this.updateCohort(record, state)
    }
  }
}
module.exports = UsersDB
