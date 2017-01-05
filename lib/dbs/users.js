var assert = require('assert')
var uuid = require('uuid')
var lock = require('../lock')()
var levelPromise = require('level-promise')
var createIndexer = require('level-simple-indexes')
var sublevel = require('subleveldown')
var { promisify } = require('../helpers')

// exported api
// =

class UsersDB {
  constructor (db) {
    // create levels and indexer
    this.accountsDB = sublevel(db, 'accounts', { valueEncoding: 'json' })
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
    promisify(this.indexer, ['findOne', 'addIndexes', 'removeIndexes', 'updateIndexes'])
  }

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

  async create(record) {
    assert(record && typeof record === 'object')
    record = Object.assign({}, UsersDB.defaults, record)
    record.id = uuid()
    record.createdAt = Date.now()
    return this.put(record)
  }

  async put(record) {
    assert(typeof record.id === 'string')
    var release = await lock(record.id)
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
    var release = await lock(record.id)
    try {
      await this.accountsDB.del(record.id)
      await this.indexer.removeIndexes(record)
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
  updatedAt: 0,
  createdAt: 0,

  isEmailVerified: false,
  emailVerifyNonce: null,

  isProfileDatVerified: false,
  profileVerifyToken: null
}