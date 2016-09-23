var fs = require('fs')
var http = require('http')
var path = require('path')
var crypto = require('crypto')
var mkdirp = require('mkdirp')
var datPublish = require('dat-publish')
var Dat = require('dat-js')

module.exports = Server

function Server (opts) {
  if (!(this instanceof Server)) return new Server(opts)
  if (!opts.name) throw new Error('Server name required')
  var self = this

  self.name = opts.name
  self.baseDir = opts.baseDir || process.cwd()
  self.archiverKey = opts['archiver-key'] ? opts['archiver-key'] : opts.name + '-' + crypto.randomBytes(16).toString('hex')
  self.datKey = opts['dat-key']
  self.port = opts.port || 8080
  self.dir = opts['dat-key'] ? path.join(self.baseDir, self.datKey) : null
  Object.defineProperty(self, 'settings', { get: self._settings })
}

Server.prototype._settings = function () {
  return {
    name: this.name,
    'archiver-key': this.archiverKey,
    'dat-key': this.datKey,
    'port': this.port
    // TODO: http port, discovery, root-archive
  }
}

Server.prototype._openDat = function (dir, cb) {
  if (typeof dir === 'function') return this._openDat(null, dir)
  var self = this
  dir = dir || self.dir

  var dat = self.dat = Dat({dir: dir, watchFiles: false, discovery: false})
  dat.open(function (err) {
    if (err) return cb(err)
    self.datKey = dat.archive.key.toString('hex')
    cb()
  })
}

Server.prototype.create = function (cb) {
  var self = this
  var tmpDir = path.join(self.baseDir, self.archiverKey)
  mkdirp.sync(tmpDir) // make temp dir

  self._openDat(tmpDir, function (err) {
    if (err) return cb(err)
    createServerDir()
  })

  function createServerDir () {
    self.dir = path.join(self.baseDir, self.datKey)
    fs.rename(tmpDir, self.dir, function (err) {
      if (err) return cb(err)
      self.dat.dir = self.dir
      fs.writeFile(path.join(self.dir, 'config.json'), JSON.stringify(self.settings), function (err) {
        if (err) return cb(err)
        self.dat.share(function (err) {
          // add initial file to metadata
          if (err) return cb(err)
          self.dat.close(function () {
            cb(null)
          })
        })
      })
    })
  }
}

Server.prototype.start = function () {
  var self = this

  var config

  fs.readFile(path.join(self.dir, 'config.json'), function (err, data) {
    if (err || !data) return start()
    config = JSON.parse(data)
    start()
  })

  function start () {
    var server = self.httpServer = http.createServer()
    var publish = self.publish = datPublish({
      dir: self.dir,
      discovery: {
        upload: true,
        download: false
      },
      rootArchive: config.rootArchive || false,
      index: config.index ? config.index : (config.rootArchive !== false)
    })

    publish.archiver.join(self.archiverKey)
    server.listen(config.port || self.port)
    server.once('error', function () {
      server.listen(0)
    })
    server.on('request', publish.httpRequest)
    server.once('listening', function () {
      console.log(`server started for ${self.name}:`)
      console.log(`  directory: ${self.dir}`)
      console.log(`  archiver: ${self.archiverKey}`)
      console.log(`  http: ${server.address().port}`)
    })
  }
}

Server.prototype.replicate = function (cb) {
  var self = this
  if (!self.dat) return self._openDat(replicate)
  replicate()

  function replicate () {
    console.log('starting replication for', self.name)
    self.dat.options.watchFiles = true
    self.dat.options.discovery = true
    self.dat.share(function (err) {
      if (err) return cb(err)
      console.log('sharing', self.datKey)
      cb()
    })
  }
}
