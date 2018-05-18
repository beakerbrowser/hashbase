const EventEmitter = require('events')
const crypto = require('crypto')
const path = require('path')
const promisify = require('es6-promisify')
const hyperdrive = require('hyperdrive')
const hypercoreProtocol = require('hypercore-protocol')
const datEncoding = require('dat-encoding')
const discoveryServer = require('discovery-server')
const swarmDefaults = require('datland-swarm-defaults')
const ms = require('ms')
const pda = require('pauls-dat-api')
const throttle = require('lodash.throttle')
const pump = require('pump')
const lock = require('./lock')
const {du} = require('./helpers')
const debug = require('debug')('archiver')
const figures = require('figures')

const stat = promisify(require('fs').stat)
const mkdirp = promisify(require('mkdirp'))
const rimraf = promisify(require('rimraf'))

// exported api
// =

module.exports = class Archiver extends EventEmitter {
  constructor (cloud) {
    super()
    this.cloud = cloud
    this.config = cloud.config
    this.archives = {}
    this.archivesByDKey = {}
    this.loadPromises = {}
    this.swarm = null
    this.networkId = crypto.randomBytes(32)
    this._connIdCounter = 0 // for debugging

    // initiate the swarm
    this._initializeSwarm()

    // periodically construct the indexes
    this.indexes = {popular: []}
    this._startJob(this.computePopularIndex, 'popularArchivesIndex')
    this._startJob(this.computeAllUserDiskUsageAndSwarm, 'userDiskUsage')
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

  async getArchiveDiskUsage (key, {forceUpdate, dontUpdateUser} = {}) {
    key = datEncoding.toStr(key)
    var archive = this.getArchive(key)
    if (!archive) return 0
    if (!archive.diskUsage && !forceUpdate) {
      // pull from DB
      let archiveRecord = await this.cloud.archivesDB.getByKey(key)
      archive.diskUsage = archiveRecord.diskUsage
    }
    if (!archive.diskUsage || forceUpdate) {
      // read size on disk
      console.log(figures.info, 'Calculating archive disk usage', key)
      let oldUsage = archive.diskUsage || 0
      let path = this._getArchiveFilesPath(key)
      archive.diskUsage = await du(path)

      // cache to the db
      let archiveRecord = await this.cloud.archivesDB.update(key, {diskUsage: archive.diskUsage})

      // if different, update the user record as well
      if (!dontUpdateUser && oldUsage !== archive.diskUsage) {
        archiveRecord.hostingUsers.forEach(async id => {
          let userRecord = await this.cloud.usersDB.getByID(id)
          this.computeUserDiskUsageAndSwarm(userRecord)
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
    p.then(archive => {
      this.archives[key] = archive
      this.archivesByDKey[datEncoding.toStr(archive.discoveryKey)] = archive
    })

    return p
  }

  async closeArchive (key) {
    key = datEncoding.toStr(key)
    var archive = this.archives[key]
    if (archive) {
      this._swarmArchive(archive, {download: false, upload: false})
      await new Promise(resolve => archive.close(resolve))
      delete this.archives[key]
      delete this.archivesByDKey[datEncoding.toStr(archive.discoveryKey)]
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
    var keyStr = datEncoding.toStr(key)
    var archive = this.archives[keyStr]
    if (!archive || !this.isArchiveFullyDownloaded(keyStr)) {
      return null
    }
    try {
      var st = await pda.stat(archive, '/dat.json')
      if (st.downloaded < st.blocks) {
        return null // wait for it to finish downloading
      }
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

  async getArchiveMtime (key) {
    let path = this._getArchiveFilesPath(key)
    try {
      var st = await stat(path)
      return st.mtime
    } catch (e) {
      return 0
    }
  }

  getDownloadProgress (key) {
    key = datEncoding.toStr(key)
    var archive = this.archives[key]
    if (!archive || archive.latestStats.numBlocks === 0) {
      return 0
    }
    return Math.min(archive.latestStats.numDownloadedBlocks / archive.latestStats.numBlocks, 1)
  }

  isArchiveFullyDownloaded (key) {
    key = datEncoding.toStr(key)
    var archive = this.archives[key]
    if (!archive || archive.latestStats.numBlocks === 0) {
      return false
    }
    return archive.latestStats.numDownloadedBlocks === archive.latestStats.numBlocks
  }

  async computePopularIndex () {
    var release = await lock('archiver-job')
    try {
      console.log(figures.pointerSmall, 'START Compute popular archives index')
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
      console.log(figures.warning, `FAILED Compute popular archives index (${(Date.now() - start)}ms)`)
    } finally {
      console.log(figures.tick, `FINISH Compute popular archives index (${(Date.now() - start)}ms)`)
      release()
    }
  }

  async computeUserDiskUsageAndSwarm (userRecord) {
    // sum the disk usage of each archive
    var diskUsage = 0
    await Promise.all(userRecord.archives.map(async (archiveRecord) => {
      let u = await this.getArchiveDiskUsage(archiveRecord.key, {dontUpdateUser: true})
      diskUsage += u
    }))

    // store on the user record
    userRecord.diskUsage = diskUsage
    await this.cloud.usersDB.update(userRecord.id, {diskUsage})

    // reconfigure swarms based on quota overages
    var quotaPct = this.config.getUserDiskQuotaPct(userRecord)
    userRecord.archives.forEach(archiveRecord => {
      this._swarmArchive(archiveRecord.key, {
        upload: true, // always upload
        download: quotaPct < 1 // only download if the user has capacity
      })
    })
  }

  async computeAllUserDiskUsageAndSwarm () {
    var release = await lock('archiver-job')
    try {
      console.log(figures.pointerSmall, 'START Compute user quota usage')
      var start = Date.now()
      var users = await this.cloud.usersDB.list()
      await Promise.all(users.map(this.computeUserDiskUsageAndSwarm.bind(this)))
    } catch (e) {
      console.error(e)
      console.log(figures.warning, `FAILED Compute user quota usage (${(Date.now() - start)}ms)`)
    } finally {
      console.log(figures.tick, `FINISH Compute user quota usage (${(Date.now() - start)}ms)`)
      release()
    }
  }

  async deleteDeadArchives () {
    var release = await lock('archiver-job')
    try {
      console.log(figures.pointerSmall, 'START Delete dead archives')
      var start = Date.now()
      var deadArchiveKeys = await this.cloud.archivesDB.listDeadArchiveKeys()
      await Promise.all(deadArchiveKeys.map(async (archiveKey) => {
        // make sure the archive is closed
        this.closeArchive(archiveKey)
        // delete files
        console.log(figures.info, 'Deleting', archiveKey)
        var archivePath = this._getArchiveFilesPath(archiveKey)
        await rimraf(archivePath, {disableGlob: true})
        // delete DB record
        await this.cloud.archivesDB.del(archiveKey)
      }))
    } catch (e) {
      console.error(e)
      console.log(figures.warning, `FAILED Delete dead archives (${(Date.now() - start)}ms)`)
    } finally {
      console.log(figures.tick, `FINISH Delete dead archives (${(Date.now() - start)}ms)`)
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
    var archive = hyperdrive(archivePath, key, {
      sparse: false,
      metadataStorageCacheSize: this.config.cache.metadataStorage,
      contentStorageCacheSize: this.config.cache.contentStorage,
      treeCacheSize: this.config.cache.tree
    })
    archive.isSwarming = false
    archive.replicationStreams = [] // list of all active replication streams
    Object.defineProperty(archive, 'numPeers', {get: () => archive.metadata.peers.length + 1})
    archive.manifest = null // cached manifest
    archive.diskUsage = 0 // cached disk usage
    archive.latestStats = {
      // calculated by _computeArchiveLatestStats:
      numDownloadedBlocks: 0, // # of blocks downloaded of the latest version
      numBlocks: 0, // # of blocks in the latest version
      numBytes: 0, // # of bytes in the latest version
      numFiles: 0 // # of files in the latest version
    }
    archive.recomputeMetadata = throttle(() => {
      this._computeArchiveLatestStats(archive)
      this.getArchiveDiskUsage(archive.key, {forceUpdate: true})
    }, ms('5s'), {leading: true, trailing: true})

    // wait for ready
    await new Promise((resolve, reject) => {
      archive.ready(err => {
        if (err) reject(err)
        else resolve()
      })
    })

    // read cached data from DB from DB
    this.cloud.archivesDB.getByKey(datEncoding.toStr(key)).then(record => {
      const st = archive.latestStats
      for (let k in st) {
        st[k] = (typeof record[k] === 'number') ? record[k] : st[k]
      }
      if (!st.numBlocks) {
        // need to compute, wasn't cached in the DB
        if (archive.content) archive.recomputeMetadata()
        else archive.once('content', archive.recomputeMetadata)
      }
    })

    // wire up handlers
    archive.metadata.on('download', archive.recomputeMetadata)
    const onContentReady = () => {
      archive.content.on('download', archive.recomputeMetadata)
    }
    if (archive.content) onContentReady()
    else archive.once('content', onContentReady)

    return archive
  }

  // swarm archive
  _swarmArchive (archive, opts) {
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
    var wasSwarming = archive.isSwarming
    if (archive.isSwarming) {
      archive.replicationStreams.forEach(stream => stream.destroy()) // stop all active replications
      archive.replicationStreams.length = 0
      archive.isSwarming = false
      this.swarm.leave(archive.discoveryKey)
    }

    // done?
    if (opts.download === false && opts.upload === false) {
      if (wasSwarming) {
        console.log(figures.info, 'Unswarming archive', datEncoding.toStr(archive.key))
      }
      return
    }

    // join the swarm
    console.log(figures.info, 'Swarming archive', datEncoding.toStr(archive.key))
    archive.isSwarming = true
    archive.swarmOpts = opts
    this.swarm.listen(archive.discoveryKey, 0, () => {})
  }

  async _computeArchiveLatestStats (archive) {
    var start = Date.now()
    var release = await lock('archiver-compute-stats')
    const archiveKey = datEncoding.toStr(archive.key)
    const {metadata, content} = archive
    try {
      if (!metadata || !content) {
        // sanity check
        console.error('Had to abort computing archive stats', {archiveKey, metadata: !!metadata, content: !!content})
        return
      }

      // checkout the archive for consistency
      var co = archive.checkout(archive.version)

      // reset all stats
      const st = archive.latestStats
      for (var k in st) {
        st[k] = 0
      }

      // get stats on all files and update stats
      await datIterateFiles(co, '/', (fileSt) => {
        st.numDownloadedBlocks += countDownloadedBlocks(fileSt.offset, fileSt.blocks)
        st.numBlocks += fileSt.blocks
        st.numBytes += fileSt.size
        st.numFiles++
      })

      // update DB
      await this.cloud.archivesDB.update(archiveKey, st)

      // emit
      // - will trigger progress SSEs to push
      this.emit('progress:' + archiveKey, {
        progress: Math.min(st.numDownloadedBlocks / st.numBlocks, 1),
        diskUsage: archive.diskUsage
      })
      console.log(figures.pointerSmall, `Computed archive stats (${Date.now() - start}ms)`, archiveKey)
    } catch (err) {
      console.error('ERROR while computing archive stats', err)
    } finally {
      release()
    }

    function countDownloadedBlocks (offset, len) {
      var n = 0
      for (var i = 0; i < len; i++) {
        if (content.has(offset + i)) n++
      }
      return n
    }
  }

  _initializeSwarm () {
    console.log(figures.pointerSmall, 'Initializing Dat swarm')
    this.swarm = discoveryServer(swarmDefaults({
      hash: false,
      utp: true,
      tcp: true,
      dht: false
    }))
    this.swarm.on('error', err => console.error('Swarm error', err))
    this.swarm.on('listening', () => console.log(figures.tick, 'Swarm listening'))
    this.swarm.on('connection', (connection, info) => {
      info.host = connection.address().address
      info.port = connection.address().port
      const replicationStream = this._createReplicationStream(info)
      pump(connection, replicationStream, connection)
    })
  }

  _createReplicationStream (info) {
    this.emit('new-connection', info)

    // create the protocol stream
    var connId = ++this._connIdCounter
    var start = Date.now()
    var stream = hypercoreProtocol({
      id: this.networkId,
      live: true,
      encrypt: true
    })
    stream.isActivePeer = false
    stream.peerInfo = info

    const add = (dkey) => {
      // lookup the archive
      var dkeyStr = datEncoding.toStr(dkey)
      var chan = dkeyStr.slice(0, 6) + '..' + dkeyStr.slice(-2)
      var archive = this.archivesByDKey[dkeyStr]
      if (!archive) {
        return
      }

      // ditch if we already have this stream
      if (archive.replicationStreams.indexOf(stream) !== -1) {
        return
      }

      // do some logging
      var keyStr = datEncoding.toStr(archive.key)
      var keyStrShort = keyStr.slice(0, 6) + '..' + keyStr.slice(-2)
      debug(`new connection id=${connId} key=${keyStrShort} dkey=${chan} type=${info.type} host=${info.host}:${info.port}`)

      // create the replication stream
      var so = archive.swarmOpts
      if (!so) {
        // DEBUG
        // this should NOT be happening and I'm not sure why it is
        // so let's just create a temporary swarmOpts and log
        if (this.config.pm2) {
          require('pmx').emit('debug:swarmopts-missing', {
            key: keyStr,
            isLoading: this.isLoadingArchive(keyStr),
            isSwarming: archive.isSwarming,
            numStreams: archive.replicationStreams.length
          })
        }
        so = {download: true, upload: true}
      }
      archive.replicate({
        stream,
        download: so.download,
        upload: so.upload,
        live: true
      })
      archive.replicationStreams.push(stream)
      stream.once('close', () => {
        var rs = archive.replicationStreams
        var i = rs.indexOf(stream)
        if (i !== -1) rs.splice(rs.indexOf(stream), 1)
      })
    }

    // add any requested archives
    stream.on('feed', add)

    // debugging (mostly)
    var connectionError
    stream.once('handshake', () => {
      stream.isActivePeer = true
      debug(`got handshake (${Date.now() - start}ms) id=${connId} type=${info.type} host=${info.host}:${info.port}`)
    })
    stream.on('error', err => {
      connectionError = err
      this.emit('connection-errored', info, err)
      debug(`error (${Date.now() - start}ms) id=${connId} type=${info.type} host=${info.host}:${info.port} error=${err.toString()}`)
    })
    stream.on('close', () => {
      this.emit('connection-closed', info, connectionError)
      debug(`closing connection (${Date.now() - start}ms) id=${connId} type=${info.type} host=${info.host}:${info.port}`)
    })
    return stream
  }
}

async function datIterateFiles (archive, filepath, fn) {
  var names = await datReaddir(archive, filepath, {cached: true})
  for (let name of names) {
    let filepath2 = path.join(filepath, name)
    let st = await datStat(archive, filepath2, {cached: true})
    if (st.isDirectory()) {
      await datIterateFiles(archive, filepath2, fn)
    } else {
      fn(st)
    }
  }
}

function datStat (archive, filepath, opts = {}) {
  return new Promise((resolve, reject) => {
    archive.stat(filepath, opts, (err, st) => {
      if (err) reject(err)
      else resolve(st)
    })
  })
}

function datReaddir (archive, filepath, opts = {}) {
  return new Promise((resolve, reject) => {
    archive.readdir(filepath, opts, (err, names) => {
      if (err) reject(err)
      else resolve(names)
    })
  })
}
