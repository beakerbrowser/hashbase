var level = require('level')
var assert = require('assert')
var path = require('path')
var fs = require('fs')
var Archiver = require('hypercore-archiver')
var ArchiverServer = require('archiver-server')
var wrap = require('co-express')

var {hashPassword} = require('./crypto')
var Sessions = require('./sessions')
var Proofs = require('./proofs')
var Mailer = require('./mailer')
var UsersAPI = require('./apis/users')
var ArchivesAPI = require('./apis/archives')
var ServiceAPI = require('./apis/service')
var UsersDB = require('./dbs/users')
var ArchivesDB = require('./dbs/archives')
var {promisify, promisifyModule} = require('./helpers')

class Hypercloud {
  constructor (config) {
    assert(config, 'hypercloud requires options')
    assert(config.hostname, 'config.hostname is required')
    assert(config.dir || config.db, 'hypercloud requires a dir or db option')

    // fallback config
    config.env = config.env || 'development'

    // setup config
    var { dir, db, storage } = config
    if (dir) {
      // ensure the target dir exists
      console.log('Data directory:', dir)
      try {
        fs.accessSync(dir, fs.F_OK)
      } catch (e) {
        fs.mkdirSync(dir)
      }
    }
    if (!db && dir) {
      // allocate a leveldb
      db = level(path.join(dir, 'db'), { valueEncoding: 'json' })
    }
    assert(db, 'database was not created')
    this.config = config
    this.db = db

    // state guards
    var adminCreatedPromise = new Promise(resolve => {
      this._adminCreated = resolve
    })
    this.whenAdminCreated = adminCreatedPromise.then.bind(adminCreatedPromise)

    // init components
    this.sessions = new Sessions(config)
    this.proofs = new Proofs(config)
    this.mailer = new Mailer(config)
    this.archiver = Archiver({ dir, db, storage })
    this.dat = ArchiverServer(this.archiver, {
      swarm: config.swarm,
      http: config.archiveHttp,
      datPort: config.datPort
    })
    this.usersDB = new UsersDB(this)
    this.archivesDB = new ArchivesDB(this)

    // init apis
    this.api = {
      users: new UsersAPI(this),
      archives: new ArchivesAPI(this),
      service: new ServiceAPI(this)
    }

    // promisify some apis
    promisifyModule(this.archiver, ['add', 'remove'])
    this.archiver.get = promisify(this.archiver.get, {thisArg: this.archiver, multiArgs: true})

    // wrap all APIs in co-express handling
    wrapAll(this.api.users)
    wrapAll(this.api.archives)
    wrapAll(this.api.service)
  }

  async setupAdminUser () {
    try {
      // is the admin-user config wellformed?
      var adminConfig = this.config.admin
      if (!adminConfig || !adminConfig.password) {
        console.log('Admin user not created: must set password in config')
        return this._adminCreated(false) // abort if not
      }

      // upsert the admin user with these creds
      var method = 'put'
      let {passwordHash, passwordSalt} = await hashPassword(adminConfig.password)
      var adminRecord = await this.usersDB.getByUsername('admin')
      if (!adminRecord) {
        method = 'create'
        adminRecord = {
          username: 'admin',
          scopes: ['user', 'admin:dats', 'admin:users'],
          isEmailVerified: true
        }
      }
      adminRecord.passwordHash = passwordHash
      adminRecord.passwordSalt = passwordSalt
      if (adminConfig.email) adminRecord.email = adminConfig.email
      await this.usersDB[method](adminRecord)
      console.log((method === 'create' ? 'Created' : 'Updated'), 'admin record')
      this._adminCreated(true)
    } catch (e) {
      console.error('[ERROR] While trying to create admin user:', e)
      this._adminCreated(false)
    }
  }

  close (cb) {
    if (!this.dat.swarm) return cb()
    this.dat.swarm.close(cb)
  }
}

module.exports = Hypercloud

function wrapAll (api) {
  for (let methodName of Object.getOwnPropertyNames(Object.getPrototypeOf(api))) {
    let method = api[methodName]
    if (typeof method === 'function' && methodName.charAt(0) !== '_') {
      api[methodName] = wrap(method.bind(api))
    }
  }
}
