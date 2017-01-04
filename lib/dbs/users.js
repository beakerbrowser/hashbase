var lock = require('../lock')()
var createIndexer = require('level-simple-indexes')
var sublevel = require('subleveldown')
var pify = require('pify')

// exported api
// =

module.exports = class UsersAPI {
  constructor (db) {
    // create levels and indexer
    var accountsDB = sublevel(db, 'accounts')
    var indexDB = sublevel(this.accountsDB, 'index')
    var indexer = createIndexer(this.indexDB, {
      properties: ['email', 'username', 'profileURL'],
      map: (id, next) => this.getByID(id, next)
    })

    // promisify
    this.accountsDB = pify(accountsDB, { include: ['get', 'put', 'del', 'batch'] })
    this.accountsDB = pify(indexDB, { include: ['get', 'put', 'del', 'batch'] })
    this.indexer = pify(indexer, { exclude: ['find'] })
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
      return this.accountsDB.get(id)
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
    return this.indexer.findOne('username', email)
  }

  async getByProfileURL(profileURL) {
    assert(typeof profileURL === 'string')
    return this.indexer.findOne('profileURL', email)
  }

  list() {
    return this.acountsDB.createValueStream()
  }

  async create(record) {
    assert(record && typeof record === 'object')
    record = Object.assign({}, UsersAPI.defaults, record)
    record.id = uuid()
    record.createdAt = Date.now()
    return this.put(record)
  }

  async put(record) {
    assert(typeof record.id === 'string')
    var release = await lock(record.id)
    try {
      record.updatedAt = Date.now()
      await this.acountsDB.put(record.id, record)
      await this.indexer.updateIndexes(record)
    } finally () {
      release()
    }
  }

  async del(record) {
    assert(typeof record.id === 'string')
    var release = await lock(record.id)
    try {
      await this.acountsDB.del(record.id)
      await this.indexer.removeIndexes(record)
    } finally () {
      release()
    }
  }
}

// default user-record values
UsersAPI.defaults = {
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

// user-record validation schemas
UsersAPI.schemas = {
  username: {
    isString: true,
    isLength: { options: { min: 3, max: 16 }},
    errorMessage: 'Invalid username'
  },
  password: {
    isString: true,
    isLength: { options: { min: 3, max: 100 }},
    errorMessage: 'Invalid password'
  },
  email: {
    isEmail: true,
    isLength: { options: { min: 3, max: 100 }},
  },
  profileURL: {
    isDatURL: true
  }
}