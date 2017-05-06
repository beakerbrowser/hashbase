var path = require('path')
var promisify = require('es6-promisify')
var hyperdrive = require('hyperdrive')
var datEncoding = require('dat-encoding')
var discoverySwarm = require('discovery-swarm')
var swarmDefaults = require('datland-swarm-defaults')
var mkdirp = require('mkdirp')
var getFolderSize = require('get-folder-size')
var ms = require('ms')
var pda = require('pauls-dat-api')
var debug = require('debug')('archiver')
var debugJobs = require('debug')('jobs')

mkdirp = promisify(mkdirp)
getFolderSize = promisify(getFolderSize)

// exported api
// =

module.exports = class Archiver {
  constructor (cloud) {
    this.cloud = cloud
    this.config = cloud.config
    this.archives = {}
    this.loadPromises = {}

    // periodically construct the indexes
    this.indexes = {popular: []}
    this._startJob(this.computePopularIndex, 'popularArchivesIndex')
    this._startJob(this.computeUserQuotaUsage, 'userQuotaUsage')
  }

  // methods
  // =

  getArchive (key) {
    return this.archives[key]
  }

  isLoadingArchive (key) {
    return key in this.loadPromises
  }

  // load archive (wrapper) manages load promises
  async loadArchive (key) {
    key = datEncoding.toStr(key)

    // fallback to archive if it exists
    if (key in this.archives) {
      return this.archives[key]
    }

    // fallback to the promise, if it exists
    if (key in this.loadPromises) {
      return this.loadPromises[key]
    }

    // ensure the folder exists
    var archivePath = this._getArchiveFilesPath(key)
    await mkdirp(archivePath)

    // run and cache the promise
    var p = this._loadArchiveInner(archivePath, key)
    this.loadPromises[key] = p

    // when done, clear the promise
    const clear = () => delete this.loadPromises[key]
    p.then(clear, clear)

    // when done, save the archive instance
    p.then(archive => { this.archives[key] = archive })

    return p
  }

  async closeArchive (key) {
    key = datEncoding.toStr(key)
    var archive = this.archives[key]
    if (archive) {
      archive.replicationStreams.forEach(s => s.destroy())
      archive.swarm.close()
      await new Promise(resolve => archive.close(resolve))
      delete this.archives[key]
    }
  }

  async closeAllArchives () {
    return Promise.all(Object.keys(this.archives).map(key =>
      this.closeArchive(key)
    ))
  }

  // helper only reads manifest from disk if DNE or changed
  async getManifest (key) {
    var archive = this.archives[datEncoding.toStr(key)]
    if (!archive) {
      console.log('NOT FOUND', key)
      return null
    }
    try {
      var st = await pda.stat(archive, '/dat.json')
      if (archive.manifest) {
        if (st.offset === archive.manifest._offset) {
          // use cached
          return archive.manifest
        }
      }
      archive.manifest = await pda.readManifest(archive)
      archive.manifest._offset = st.offset
      return archive.manifest
    } catch (e) {
      console.error('Failed to load manifest for', archive.key, e)
      return null
    }
  }

  computePopularIndex () {
    debugJobs('Computing popular archives index')
    var popular = Object.keys(this.archives)
    popular.sort((aKey, bKey) => (
      this.archives[bKey].numPeers - this.archives[aKey].numPeers
    ))
    this.indexes.popular = popular.slice(0, 100).map(key => (
      {key, numPeers: this.archives[key].numPeers}
    ))
  }

  computeUserQuotaUsage () {
    return new Promise(resolve => {
      // stream all user records
      var numProcessing = 0
      var stream = this.cloud.usersDB.createValueStream()
      stream.on('data', async (userRecord) => {
        numProcessing++

        // sum the disk usage of each archive
        var diskUsage = 0
        await Promise.all(userRecord.archives.map(async (archiveRecord) => {
          var path = this._getArchiveFilesPath(archiveRecord.key)
          var archiveUsage = await getFolderSize(path)
          diskUsage += archiveUsage
        }))

        // store on the user record
        await this.cloud.usersDB.update(userRecord.id, {diskUsage})

        // reconfigure swarms based on quota overages
        // TODO

        // done?
        if (--numProcessing === 0) {
          resolve()
        }
      })
    })
  }

  // internal
  // =

  _getArchiveFilesPath (key) {
    return path.join(this.config.dir, 'archives', key.slice(0, 2), key.slice(2))
  }

  _startJob (method, configKey) {
    var i = setInterval(method.bind(this), ms(this.config.jobs[configKey]))
    i.unref()
  }

  // load archive (inner) main load logic
  async _loadArchiveInner (archivePath, key) {
    // create the archive instance
    var archive = hyperdrive(archivePath, key, {sparse: false})
    archive.replicationStreams = [] // list of all active replication streams
    archive.numPeers = 0 // num of active peers
    archive.manifest = null // cached manifest

    // wait for ready
    await new Promise((resolve, reject) => {
      archive.ready(err => {
        if (err) reject(err)
        else resolve()
      })
    })

    // join the swarm
    var swarm = discoverySwarm(swarmDefaults({
      hash: false,
      utp: true,
      tcp: true,
      stream: (info) => {
        var dkey = datEncoding.toStr(archive.discoveryKey)
        var chan = dkey.slice(0, 6) + '..' + dkey.slice(-2)
        var keyStrShort = key.slice(0, 6) + '..' + key.slice(-2)
        debug('new connection chan=%s type=%s host=%s key=%s', chan, info.type, info.host, keyStrShort)

        // create the replication stream
        var stream = archive.replicate({live: true})
        stream.isActivePeer = false
        archive.replicationStreams.push(stream)
        stream.once('close', () => {
          var rs = archive.replicationStreams
          var i = rs.indexOf(stream)
          if (i !== -1) rs.splice(rs.indexOf(stream), 1)
          archive.numPeers = countActivePeers(archive)
        })

        // timeout the connection after 5s if handshake does not occur
        var TO = setTimeout(() => {
          debug('handshake timeout chan=%s type=%s host=%s key=%s', chan, info.type, info.host, keyStrShort)
          stream.destroy(new Error('Timed out waiting for handshake'))
        }, 5000)
        stream.once('handshake', () => {
          stream.isActivePeer = true
          archive.numPeers = countActivePeers(archive)
          clearTimeout(TO)
        })

        // debugging
        stream.on('error', err => debug('error chan=%s type=%s host=%s key=%s', chan, info.type, info.host, keyStrShort, err))
        stream.on('close', () => debug('closing connection chan=%s type=%s host=%s key=%s', chan, info.type, info.host, keyStrShort))
        return stream
      }
    }))
    swarm.listen(this.config.datPort)
    swarm.on('error', err => debug('Swarm error for', key, err))
    swarm.join(archive.discoveryKey)

    debug('Swarming archive', key, 'discovery key', datEncoding.toStr(archive.discoveryKey))
    archive.swarm = swarm

    return archive
  }
}

function countActivePeers (archive) {
  return archive.replicationStreams.reduce((acc, stream) => (
    acc + stream.isActivePeer ? 1 : 0
  ), 1) // start from one to include self
}
