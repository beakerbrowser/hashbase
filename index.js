var path = require('path')
var mkdirp = require('mkdirp')
var level = require('level')
var hypercore = require('hypercore')
var swarm = require('hyperdrive-archive-swarm')
var Dat = require('dat-js')
var Server = require('./lib/server')

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
  swarm(self.feed)

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
  swarm(self.feed)
  var stream = this.feed.createReadStream({start: 0, live: true})
  stream.on('data', function (data) {
    var key = JSON.parse(data.toString())['dat-key']
    var dir = path.join(self.dir, key)
    mkdirp.sync(dir)
    var dat = Dat({dir: dir, key: key})
    dat.download()
  })
}
