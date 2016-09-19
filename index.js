var path = require('path')
var fs = require('fs')
var http = require('http')
var mkdirp = require('mkdirp')
var crypto = require('crypto')
var level = require('level')
var hypercore = require('hypercore')
var swarm = require('hyperdrive-archive-swarm')
var datPublish = require('dat-publish')
var Dat = require('dat-js')

module.exports = Hypercloud

function Hypercloud (opts) {
  if (!(this instanceof Hypercloud)) return new Hypercloud(opts)
  if (!opts) opts = {}
  var self = this

  self.dir = opts.dir || path.join(__dirname, 'servers')
  mkdirp.sync(self.dir)
  self.db = level(path.join(self.dir, opts.dbName || '.hypercloud'))
  self.core = hypercore(self.db)
  self.servers = [] // TODO: clouds
}

Hypercloud.prototype.create = function (key) {
  // This could be used to create new "clouds" for each hypercore feed
  var self = this
  self.feed = self.core.createFeed(key)
  // TODO: something like: self.clouds.push({feed: feed, key: key})
}

Hypercloud.prototype.addServer = function (name, opts, cb) {
  if (!name) throw new Error('name required to add server')
  if (typeof opts === 'function') return this.addServer(name, null, opts)
  if (!opts) opts = {}
  var self = this

  var server = Server({name: name, baseDir: self.dir})
  server.create(function (err) {
    if (err) return cb(err)
    self.feed.append(JSON.stringify(server.settings), function (err) {
      if (err) return cb(err)
      cb(null, server)
    })
  })
}

Hypercloud.prototype.start = function (opts, cb) {
  // start dat publish servers
  var self = this
  var stream = self.feed.createReadStream({start: 0, live: true})
  stream.on('data', function (data) {
    var opts = JSON.parse(data.toString())
    opts.baseDir = self.dir
    var server = Server(opts)
    self.servers.push(server)
    server.start()
  })
}

Hypercloud.prototype.replicate = function (cb) {
  // share all servers over dat and hypercore feed for total replication
  var self = this
  var sw = swarm(self.feed)

  var stream = this.feed.createReadStream({start: 0, live: true})
  stream.on('data', function (data) {
    var opts = JSON.parse(data.toString())
    opts.baseDir = self.dir
    var server = Server(opts)
    self.servers.push(server)
    server.replicate(function (err) {
      if (err) return cb(err)
    })
  })
}

Hypercloud.prototype.createBackup = function (key, cb) {
  // hypercore feed key to backup
  var self = this
  self.create(key)
  var sw = swarm(self.feed)
  var stream = this.feed.createReadStream({start: 0, live: true})
  stream.on('data', function (data) {
    var key = JSON.parse(data.toString())['dat-key']
    var dir = path.join(self.dir, key)
    mkdirp.sync(dir)
    var dat = Dat({dir: dir, key: key})
    dat.download()
  })
}

function Server (opts) {
  if (!(this instanceof Server)) return new Server(opts)
  if (!opts.name) throw new Error('Server name required')
  var self = this

  self.name = opts.name
  self.baseDir = opts.baseDir || process.cwd()
  self.archiverKey = opts['archiver-key'] ? opts['archiver-key'] : opts.name + '-' + crypto.randomBytes(16).toString('hex')
  self.datKey = opts['dat-key']
  self.dir = opts['dat-key'] ? path.join(self.baseDir, self.datKey) : null
  Object.defineProperty(self, 'settings', { get: self._settings })
}

Server.prototype._settings = function () {
  return {
    name: this.name,
    'archiver-key': this.archiverKey,
    'dat-key': this.datKey
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

  var server = self.httpServer = http.createServer()
  var publish = self.publish = datPublish({
    dir: self.dir,
    discovery: {
      upload: true,
      download: false
    },
    rootArchive: false // TODO: let user set this
  })

  publish.archiver.join(self.archiverKey)
  server.listen(8080) // TODO: user ports
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

Server.prototype.replicate = function (cb) {
  var self = this
  if (!self.dat) return self._openDat(replicate)
  replicate()

  function replicate () {
    console.log('starting replication for', self.name)
    self.dat.options.discovery = true
    self.dat.share(function (err) {
      if (err) return cb(err)
      console.log('sharing', self.datKey)
      cb()
    })
  }
}
