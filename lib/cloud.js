var assert = require('assert')
var fs = require('fs')
var memdb = require('memdb')
var Archiver = require('hypercore-archiver')
var ArchiverServer = require('archiver-server')
var ArchiverApi = require('archiver-api')
var RAM = require('random-access-memory')

module.exports = Hypercloud

function Hypercloud (opts) {
  if (!(this instanceof Hypercloud)) return new Hypercloud(opts)

  assert.ok(opts, 'hypercloud requires options')
  assert.ok(opts.dir || opts.memdb, 'hyperarchiver requires a dir or memdb option')

  var dir = opts.dir, db, storage
  if (dir) {
    // ensure the target dir exists
    try {
      fs.accessSync(dir, fs.F_OK)
    } catch (e) {
      fs.mkdirSync(dir)
    }
    // dont set storageOpt, it will default to random-access-file
  } else {
    // use in-memory instances
    db = memdb()
    storage = RAM
  }

  this.archiver = Archiver({ dir, db, storage })
  this.api = ArchiverApi(this.archiver)
  this.dat = ArchiverServer(this.archiver, {
    swarm: opts.swarm,
    http: opts.archiveHttp,
    datPort: opts.datPort
  })
}

Hypercloud.prototype.addUser = function (req, res, cb) {
  this.api.add(req, res, { body: req.body }, (err, code, data) => {
    if (err) return cb(err, code)
    // TODO: set up user archive and read info
    cb(err, code, data)
  })
}

Hypercloud.prototype.close = function () {
  // TODO
}