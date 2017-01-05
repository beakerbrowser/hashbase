var level = require('level')
var assert = require('assert')
var path = require('path')
var fs = require('fs')
var Archiver = require('hypercore-archiver')
var ArchiverServer = require('archiver-server')
var ArchiverAPI = require('archiver-api')
var wrap = require('co-express')

var Sessions = require('./sessions')
var Proofs = require('./proofs')
var Mailer = require('./mailer')
var UsersAPI = require('./apis/users')
var UsersDB = require('./dbs/users')

class Hypercloud {
  constructor(config) {
    assert(config, 'hypercloud requires options')
    assert(config.hostname, 'config.hostname is required')
    assert(config.dir || config.db, 'hypercloud requires a dir or db option')

    // setup config
    var { dir, db, storage } = config
    if (dir) {
      // ensure the target dir exists
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
    this.usersDB = new UsersDB(db)

    // init apis
    this.api = {
      users: new UsersAPI(this),
      archives: ArchiverAPI(this.archiver)
    }

    // wrap all APIs in co-express handling
    wrapAll(this.api.users)
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
    if (typeof method === 'function')
      api[methodName] = wrap(method.bind(api))
  }
}