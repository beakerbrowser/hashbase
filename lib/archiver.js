const EventEmitter = require('events')
const crypto = require('crypto')
const path = require('path')
const promisify = require('es6-promisify')
const hyperdrive = require('hyperdrive')
const hypercoreProtocol = require('hypercore-protocol')
const datEncoding = require('dat-encoding')
const discoverySwarm = require('discovery-swarm')
const swarmDefaults = require('datland-swarm-defaults')
const ms = require('ms')
const pda = require('pauls-dat-api')
const throttle = require('lodash.throttle')
const each = require('stream-each')
const lock = require('./lock')
const {DAT_SWARM_PORT} = require('./const')
const debug = require('debug')('archiver')
const debugJobs = require('debug')('jobs')

const stat = promisify(require('fs').stat)
const mkdirp = promisify(require('mkdirp'))
const rimraf = promisify(require('rimraf'))
const getFolderSize = promisify(require('get-folder-size'))

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
    if (forceUpdate || !archive.diskUsage) {
      // read size on disk
      let oldUsage = archive.diskUsage || 0
      let path = this._getArchiveFilesPath(key)
      archive.diskUsage = await getFolderSize(path)

      // if different, update the user record as well
      if (!dontUpdateUser && oldUsage !== archive.diskUsage) {
        this.cloud.archivesDB.getByKey(key).then(archiveRecord => {
          archiveRecord.hostingUsers.forEach(async id => {
            let userRecord = await this.cloud.usersDB.getByID(id)
            this.computeUserDiskUsageAndSwarm(userRecord)
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
    if (!archive || archive.latestStats.length === 0) {
      return false
    }
    return Math.min(archive.latestStats.downloaded / archive.latestStats.length, 1)
  }

  isArchiveFullyDownloaded (key) {
    key = datEncoding.toStr(key)
    var archive = this.archives[key]
    if (!archive || archive.latestStats.length === 0) {
      return false
    }
    return archive.latestStats.downloaded === archive.latestStats.length
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
      debugJobs('START Compute user quota usage')
      var start = Date.now()
      var users = await this.cloud.usersDB.list()
      await Promise.all(users.map(this.computeUserDiskUsageAndSwarm.bind(this)))
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
        // make sure the archive is closed
        this.closeArchive(archiveKey)
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
    archive.isSwarming = false
    archive.replicationStreams = [] // list of all active replication streams
    Object.defineProperty(archive, 'numPeers', {get: () => archive.metadata.peers.length + 1})
    archive.manifest = null // cached manifest
    archive.diskUsage = 0 // cached disk usage
    archive.latestStats = {
      // calculated by _recomputeArchiveLatestStats:
      downloaded: 0, // # of blocks downloaded of the latest version
      length: 0, // # of blocks in the latest version
      byteLength: 0, // # of bytes in the latest version
      files: 0 // # of files in the latest version
    }
    archive.recomputeMetadata = throttle(() => {
      this._recomputeArchiveLatestStats(archive)
      this.getArchiveDiskUsage(archive.key, {forceUpdate: true})
    }, ms('5s'), {trailing: true})

    // wait for ready
    await new Promise((resolve, reject) => {
      archive.ready(err => {
        if (err) reject(err)
        else resolve()
      })
    })

    // wire up handlers
    archive.metadata.on('download', archive.recomputeMetadata)
    const gotContent = () => {
      this._recomputeArchiveLatestStats(archive)
      archive.content.on('download', archive.recomputeMetadata)
      archive.content.on('download', () => {
        // optimistically increment the downloaded blocks number
        // (this means the number will occassionally be inflated)
        // recomputeMetadata, which is called much less frequently, will give an exact number
        archive.latestStats.downloaded++
      })
    }
    if (archive.content) gotContent()
    else archive.on('content', gotContent)

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
    if (archive.isSwarming) {
      archive.replicationStreams.forEach(stream => stream.destroy()) // stop all active replications
      archive.replicationStreams.length = 0
      archive.isSwarming = false
      this.swarm.leave(archive.discoveryKey)
    }

    // done?
    if (opts.download === false && opts.upload === false) {
      return
    }

    // join the swarm
    debug('Swarming archive', datEncoding.toStr(archive.key), 'discovery key', datEncoding.toStr(archive.discoveryKey))
    archive.isSwarming = true
    archive.swarmOpts = opts
    this.swarm.join(archive.discoveryKey, { announce: !(opts.upload === false) })
  }

  async _recomputeArchiveLatestStats (archive) {
    const {metadata, content} = archive
    const st = archive.latestStats
    if (!metadata || !content) {
      return
    }

    // recompute current state
    st.downloaded = 0
    st.length = 0
    st.byteLength = 0
    st.files = 0
    let initial = archive.tree.checkout(0)
    let current = archive.tree.checkout(archive.version)
    let stream = initial.diff(current, {dels: true, puts: true})
    await new Promise(resolve => each(stream, ondata, resolve))

    function ondata (data, next) {
      if (!data.value) return next()
      if (data.type === 'del') {
        st.byteLength -= data.value.size
        st.length -= data.value.blocks
        st.downloaded -= countDownloaded(data.value.offset, data.value.blocks)
        st.files--
      } else {
        st.byteLength += data.value.size
        st.length += data.value.blocks
        st.downloaded += countDownloaded(data.value.offset, data.value.blocks)
        st.files++
      }
      next()
    }

    function countDownloaded (offset, len) {
      var n = 0
      for (var i = 0; i < len; i++) {
        if (content.has(offset + i)) n++
      }
      return n
    }
  }

  _initializeSwarm () {
    this.swarm = discoverySwarm(swarmDefaults({
      id: this.networkId,
      hash: false,
      utp: true,
      tcp: true,
      stream: this._createReplicationStream.bind(this)
    }))
    this.swarm.once('error', () => this.swarm.listen(0))
    this.swarm.listen(DAT_SWARM_PORT)
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

    // add the archive if the discovery network gave us any info
    if (info.channel) {
      add(info.channel)
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

