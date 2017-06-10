const path = require('path')
const promisify = require('es6-promisify')
const hyperdrive = require('hyperdrive')
const datEncoding = require('dat-encoding')
const discoverySwarm = require('discovery-swarm')
const swarmDefaults = require('datland-swarm-defaults')
const ms = require('ms')
const pda = require('pauls-dat-api')
const throttle = require('lodash.throttle')
const lock = require('./lock')
const debug = require('debug')('archiver')
const debugJobs = require('debug')('jobs')

const mkdirp = promisify(require('mkdirp'))
const rimraf = promisify(require('rimraf'))
const getFolderSize = promisify(require('get-folder-size'))

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
    this._startJob(this.computeUserDiskUsageAndSwarm, 'userDiskUsage')
    this._startJob(this.deleteDeadArchives, 'deleteDeadArchives')
  }

  // methods
  // =

  getArchive (key) {
    return this.archives[key]
  }

  isLoadingArchive (key) {
    return key in this.loadPromises
  }

  async getArchiveDiskUsage (key, {forceUpdate} = {}) {
    key = datEncoding.toStr(key)
    var archive = this.getArchive(key)
    if (!archive) return 0
    if (forceUpdate || !archive.diskUsage) {
      // read size on disk
      let oldUsage = archive.diskUsage || 0
      let path = this._getArchiveFilesPath(key)
      archive.diskUsage = await getFolderSize(path)

      // if different, update the user record as well
      if (oldUsage != archive.diskUsage) {
        let diff = archive.diskUsage - oldUsage
        this.cloud.archivesDB.getByKey(key).then(archiveRecord => {
          archiveRecord.hostingUsers.forEach(async id => {
            let userRecord = await this.cloud.usersDB.getByID(id)
            userRecord.diskUsage += diff
            this.cloud.usersDB.update(id, {diskUsage: userRecord.diskUsage})
          })
        })
      }
    }
    return archive.diskUsage
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
      this._swarm(archive, {download: false, upload: false})
      await new Promise(resolve => archive.close(resolve))
      delete this.archives[key]
    } else {
      // is archive still loading?
      // wait to finish then try to close
      if (this.isLoadingArchive(key)) {
        await this.loadPromises[key]
        return this.closeArchive(key)
      }
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
      if (!e.notFound) {
        console.error('Failed to load manifest for', archive.key, e)
      }
      return null
    }
  }

  async computePopularIndex () {
    var release = await lock('archiver-job')
    try {
      debugJobs('START Compute popular archives index')
      var start = Date.now()
      var popular = Object.keys(this.archives)
      popular.sort((aKey, bKey) => (
        this.archives[bKey].numPeers - this.archives[aKey].numPeers
      ))
      this.indexes.popular = popular.slice(0, 100).map(key => (
        {key, numPeers: this.archives[key].numPeers}
      ))
    } catch (e) {
      console.error(e)
      debugJobs('FAILED Compute popular archives index (%dms)', (Date.now() - start))
    } finally {
      debugJobs('FINISH Compute popular archives index (%dms)', (Date.now() - start))
      release()
    }
  }

  async computeUserDiskUsageAndSwarm () {
    var release = await lock('archiver-job')
    try {
      debugJobs('START Compute user quota usage')
      var start = Date.now()
      var users = await this.cloud.usersDB.list()
      await Promise.all(users.map(async (userRecord) => {
        // sum the disk usage of each archive
        var diskUsage = 0
        await Promise.all(userRecord.archives.map(async (archiveRecord) => {
          diskUsage += await this.getArchiveDiskUsage(archiveRecord.key)
        }))

        // store on the user record
        userRecord.diskUsage = diskUsage
        await this.cloud.usersDB.update(userRecord.id, {diskUsage})

        // reconfigure swarms based on quota overages
        var quotaPct = this.config.getUserDiskQuotaPct(userRecord)
        userRecord.archives.forEach(archiveRecord => {
          this._swarm(archiveRecord.key, {
            upload: true, // always upload
            download: quotaPct < 1 // only download if the user has capacity
          })
        })
      }))
    } catch (e) {
      console.error(e)
      debugJobs('FAILED Compute user quota usage (%dms)', (Date.now() - start))
    } finally {
      debugJobs('FINISH Compute user quota usage (%dms)', (Date.now() - start))
      release()
    }
  }

  async deleteDeadArchives () {
    var release = await lock('archiver-job')
    try {
      debugJobs('START Delete dead archives')
      var start = Date.now()
      var deadArchiveKeys = await this.cloud.archivesDB.listDeadArchiveKeys()
      await Promise.all(deadArchiveKeys.map(async (archiveKey) => {
        // delete files
        var archivePath = this._getArchiveFilesPath(archiveKey)
        await rimraf(archivePath, {disableGlob: true})
      }))
    } catch (e) {
      console.error(e)
      debugJobs('FAILED Delete dead archives (%dms)', (Date.now() - start))
    } finally {
      debugJobs('FINISH Delete dead archives (%dms)', (Date.now() - start))
      release()
    }
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
    archive.numPeers = 1 // num of active peers (1 for self)
    archive.manifest = null // cached manifest
    archive.diskUsage = 0 // cached disk usage
    archive.recomputeDiskUsage = throttle(() => {
      this.getArchiveDiskUsage(archive.key, {forceUpdate: true})
    }, ms('10s'), {trailing: true})

    // wait for ready
    await new Promise((resolve, reject) => {
      archive.ready(err => {
        if (err) reject(err)
        else resolve()
      })
    })

    // wire up handlers
    archive.metadata.on('download', archive.recomputeDiskUsage)
    archive.on('content', () => {
      archive.content.on('download', archive.recomputeDiskUsage)
    })

    return archive
  }

  // swarm archive
  _swarm (archive, opts) {
    if (typeof archive === 'string') {
      archive = this.getArchive(archive)
      if (!archive) return
    }

    // are any opts changed?
    var so = archive.swarmOpts
    if (so && so.download === opts.download && so.upload === opts.upload) {
      return
    }

    // close existing swarm
    if (archive.swarm) {
      archive.replicationStreams.forEach(stream => stream.destroy()) // stop all active replications
      archive.replicationStreams.length = 0
      archive.swarm.destroy()
      archive.swarm = null
    }

    // done?
    if (opts.download === false && opts.upload === false) {
      return
    }

    // join the swarm
    var swarm = discoverySwarm(swarmDefaults({
      hash: false,
      utp: true,
      tcp: true,
      stream: (info) => {
        var key = datEncoding.toStr(archive.key)
        var dkey = datEncoding.toStr(archive.discoveryKey)
        var chan = dkey.slice(0, 6) + '..' + dkey.slice(-2)
        var keyStrShort = key.slice(0, 6) + '..' + key.slice(-2)
        debug('new connection chan=%s type=%s host=%s key=%s', chan, info.type, info.host, keyStrShort)

        // create the replication stream
        var stream = archive.replicate({
          download: opts.download,
          upload: opts.upload,
          live: true
        })
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
    swarm.on('error', err => debug('Swarm error for', datEncoding.toStr(archive.key), err))
    swarm.join(archive.discoveryKey, { announce: !(opts.upload === false) })

    debug('Swarming archive', datEncoding.toStr(archive.key), 'discovery key', datEncoding.toStr(archive.discoveryKey))
    archive.swarm = swarm
    archive.swarmOpts = opts
  }
}

function countActivePeers (archive) {
  return archive.replicationStreams.reduce((acc, stream) => (
    acc + (stream.isActivePeer ? 1 : 0)
  ), 1) // start from one to include self
}