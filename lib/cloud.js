var assert = require('assert')
var fs = require('fs')
var memdb = require('memdb')
var Archiver = require('hypercore-archiver')
// var ArchiverServer = require('archiver-server') TODO needed?
var ArchiverApi = require('archiver-api')

module.exports = Hypercloud

function Hypercloud (opts) {
  if (!(this instanceof Hypercloud)) return new Hypercloud(opts)

  assert.ok(opts, 'hypercloud requires options')
  assert.ok(opts.dir || opts.memdb, 'hyperarchiver requires a dir or memdb option')

  var dirOrDb
  if (opts.dir) {
    // ensure the target dir exists
    dirOrDb = opts.dir
    try {
      fs.accessSync(opts.dir, fs.F_OK)
    } catch (e) {
      fs.mkdirSync(opts.dir)
    }
  } else {
    // create the memdb
    dirOrDb = memdb()
  }

  this.archiver = Archiver(dirOrDb)
  this.api = ArchiverApi(this.archiver)
  // var datServer = ArchiverServer(archiver, {
  //   swarm: opts.swarm,
  //   http: opts.archiveHttp,
  //   datPort: opts.datPort
  // })
}

Hypercloud.prototype.addUser = function (req, res, cb) {
  this.api.add(req, res, { body: req.body }, (err, code, data) => {
    if (err) return cb(err, code)
    // TODO: set up user archive and read info
    cb(err, code, data)
  })
}
