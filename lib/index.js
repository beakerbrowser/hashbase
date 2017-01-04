var assert = require('assert')
var fs = require('fs')
var Archiver = require('hypercore-archiver')
var ArchiverServer = require('archiver-server')
var ArchiverAPI = require('archiver-api')

var Mailer = require('./mailer')
var Sessions = require('./sessions')
var UsersAPI = require('./apis/users')
var UsersDB = require('./dbs/users')

module.exports = Hypercloud

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

    // init components
    this.sessions = new Sessions(config)
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
  }

  close (cb) {
    if (!this.dat.swarm) return cb()
    this.dat.swarm.close(cb)
  }
}
