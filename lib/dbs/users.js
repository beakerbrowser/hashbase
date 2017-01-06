var assert = require('assert')
var uuid = require('uuid')
var levelPromise = require('level-promise')
var createIndexer = require('level-simple-indexes')
var sublevel = require('subleveldown')
var { promisifyModule } = require('../helpers')
var lock = require('../lock')

// exported api
// =

class UsersDB {
  constructor (cloud) {
    // create levels and indexer
    this.accountsDB = sublevel(cloud.db, 'accounts', { valueEncoding: 'json' })
    this.indexDB = sublevel(this.accountsDB, 'index')
    this.indexer = createIndexer(this.indexDB, {
      properties: ['email', 'username', 'profileURL'],
      map: (id, next) => {
        this.getByID(id)
          .catch(next)
          .then(res => next(null, res))
      }
    })

    // promisify
    levelPromise.install(this.accountsDB)
    levelPromise.install(this.indexDB)
    promisifyModule(this.indexer, ['findOne', 'addIndexes', 'removeIndexes', 'updateIndexes'])
  }

  // basic ops
  // =

  async create(record) {
    assert(record && typeof record === 'object')
    record = Object.assign({}, UsersDB.defaults, record)
    record.id = uuid()
    record.createdAt = Date.now()
    await this.put(record)
    return record
  }

  async put(record) {
    assert(typeof record.id === 'string')
    var release = await lock('users:write:'+record.id)
    try {
      record.updatedAt = Date.now()
      await this.accountsDB.put(record.id, record)
      await this.indexer.updateIndexes(record)
    } finally {
      release()
    }
  }

  async del(record) {
    assert(typeof record.id === 'string')
    var release = await lock('users:write:'+record.id)
    try {
      await this.accountsDB.del(record.id)
      await this.indexer.removeIndexes(record)
    } finally {
      release()
    }
  }

  // getters
  // =

  async isEmailTaken(email) {
    var record = await this.getByEmail(email)
    return !!record
  }

  async isUsernameTaken(username) {
    var record = await this.getByUsername(username)
    return !!record
  }

  async getByID(id) {
    assert(typeof id === 'string')
    try {
      return await this.accountsDB.get(id)
    } catch (e) {
      if (e.notFound) return null
      throw e
    }
  }

  async getByEmail(email) {
    assert(typeof email === 'string')
    return this.indexer.findOne('email', email)
  }

  async getByUsername(username) {
    assert(typeof username === 'string')
    return this.indexer.findOne('username', username)
  }

  async getByProfileURL(profileURL) {
    assert(typeof profileURL === 'string')
    return this.indexer.findOne('profileURL', profileURL)
  }

  list() {
    return this.accountsDB.createValueStream()
  }


  // highlevel updates
  // =

  async addArchive(userId, archiveKey) {
    var release = await lock('users:update:'+userId)
    try {
      // fetch/create record
      var userRecord = await this.getByID(userId)

      // add archive
      if (userRecord.archives.includes(archiveKey)) {
        return // already hosting
      }
      userRecord.archives.push(archiveKey)

      // update records
      await this.put(userRecord)
    } finally {
      release()
    }
  }

  async removeArchive(userId, archiveKey) {
    var release = await lock('users:update:'+userId)
    try {
      // fetch/create record
      var userRecord = await this.getByID(userId)

      // remove user
      var index = userRecord.archives.indexOf(archiveKey)
      if (index === -1) {
        return // not already hosting
      }
      userRecord.archives.splice(index, 1)

      // update records
      await this.put(userRecord)
    } finally {
      release()
    }
  }
}
module.exports = UsersDB

// default user-record values
UsersDB.defaults = {
  username: null,
  passwordHash: null,
  passwordSalt: null,

  email: null,
  profileURL: null,
  scopes: [],
  archives: [],
  updatedAt: 0,
  createdAt: 0,

  isEmailVerified: false,
  emailVerifyNonce: null,

  isProfileDatVerified: false,
  profileVerifyToken: null
}