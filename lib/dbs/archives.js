var EventEmitter = require('events')
var assert = require('assert')
var levelPromise = require('level-promise')
var createIndexer = require('level-simple-indexes')
var sublevel = require('subleveldown')
var collect = require('stream-collector')
var through = require('through2')
var lock = require('../lock')
var { promisifyModule } = require('../helpers')

// exported api
// =

class ArchivesDB extends EventEmitter {
  constructor (cloud) {
    super()
    this.config = cloud.config
    this.archiver = cloud.archiver
    this.usersDB = cloud.usersDB

    // create levels and indexer
    this.archivesDB = sublevel(cloud.db, 'archives', { valueEncoding: 'json' })
    this.deadArchivesDB = sublevel(cloud.db, 'dead-archives')
    this.indexDB = sublevel(cloud.db, 'archives-index')
    this.indexer = createIndexer(this.indexDB, {
      keyName: 'key',
      properties: ['name', 'createdAt'],
      map: (key, next) => {
        this.getExtraByKey(key)
          .catch(next)
          .then(res => next(null, res))
      }
    })

    // promisify
    levelPromise.install(this.archivesDB)
    promisifyModule(this.indexer, ['findOne', 'addIndexes', 'removeIndexes', 'updateIndexes'])
  }

  // basic ops
  // =

  async create (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.key === 'string')
    record = Object.assign({}, ArchivesDB.defaults(), record)
    record.createdAt = Date.now()
    await this._put(record)
    await this.indexer.addIndexes(record)
    this.emit('create', record)
    return record
  }

  // just use internally - this method is a bit of a footgun
  // (it doesnt update indexes or use a transaction)
  async _put (record) {
    assert(typeof record.key === 'string')
    record.updatedAt = Date.now()
    await this.archivesDB.put(record.key, record)
    this.emit('put', record)
  }

  // update() is a put() that uses locks
  // - use this when outside of a locking transaction
  async update (key, updates) {
    assert(typeof key === 'string')
    assert(updates && typeof updates === 'object')
    var release = await lock('archives')
    try {
      var record = await this.getByKey(key)
      await this.indexer.removeIndexes(record)
      for (var k in updates) {
        if (k === 'key' || typeof updates[k] === 'undefined') {
          continue // dont allow that!
        }
        record[k] = updates[k]
      }
      record.updatedAt = Date.now()
      await this.archivesDB.put(record.key, record)
      await this.indexer.addIndexes(record)
    } finally {
      release()
    }
    this.emit('put', record)
    return record
  }

  async del (record) {
    if (typeof record === 'string') {
      let key = record
      record = await this.getByKey(record)
      if (!record) {
        record = {key}
      }
    }
    assert(record && typeof record === 'object')
    assert(typeof record.key === 'string')
    await this.archivesDB.del(record.key)
    await this.indexer.removeIndexes(record)
    await this.deadArchivesDB.del(record.key)
    this.emit('del', record)
  }

  // getters
  // =

  async getByKey (key) {
    assert(typeof key === 'string')
    try {
      return await this.archivesDB.get(key)
    } catch (e) {
      if (e.notFound) return null
      throw e
    }
  }

  async getOrCreateByKey (key) {
    var release = await lock('archives:goc:' + key)
    try {
      var archiveRecord = await this.getByKey(key)
      if (!archiveRecord) {
        archiveRecord = await this.create({ key })
      }
    } finally {
      release()
    }
    return archiveRecord
  }

  async getExtraByKey (key) {
    var archive = this.archiver.archives[key]
    var record = await this.getByKey(key)
    if (record.hostingUsers[0]) {
      record.owner = await this.usersDB.getByID(record.hostingUsers[0])
      record.name = record.owner.archives.find(a => a.key === key).name
      record.niceUrl = `${record.name}.${this.config.hostname}`
    } else {
      record.owner = null
      record.name = ''
      record.niceUrl = null
    }
    record.numPeers = archive ? archive.numPeers : 0
    record.manifest = archive ? await this.archiver.getManifest(archive.key) : null
    return record
  }

  async getByName (name) {
    assert(typeof name === 'string')
    return this.indexer.findOne('name', name)
  }

  list ({cursor, limit, reverse, sort, getExtra} = {}) {
    // 'popular' uses a special index
    if (sort === 'popular') {
      return this._listPopular({cursor, limit, reverse})
    }

    return new Promise((resolve, reject) => {
      var opts = {limit, reverse}
      // find indexes require a start- and end-point
      if (sort === 'createdAt') {
        if (reverse) {
          opts.lt = cursor || '\xff'
          opts.gte = 0
        } else {
          opts.gt = cursor || 0
          opts.lte = '\xff'
        }
      } else if (typeof cursor !== 'undefined') {
        // set cursor according to reverse
        if (reverse) opts.lt = cursor
        else opts.gt = cursor
      }
      // fetch according to sort
      var stream
      if (sort === 'createdAt') stream = this.indexer.find('createdAt', opts)
      else stream = this.archivesDB.createValueStream(opts)
      // "join" additional info
      if (getExtra) {
        stream = stream.pipe(through.obj(async (record, enc, cb) => {
          try {
            cb(null, await this.getExtraByKey(record.key))
          } catch (e) {
            cb(e)
          }
        }))
      }
      // collect into an array
      collect(stream, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
  }

  async _listPopular ({cursor, limit, reverse}) {
    cursor = cursor || 0
    limit = limit || 25

    // slice and dice the index
    var index = this.archiver.indexes.popular
    if (reverse) index = index.slice().reverse()
    index = index.slice(cursor, cursor + limit)

    // fetch the record for each item
    return Promise.all(index.map(indexEntry => (
      this.getExtraByKey(indexEntry.key)
    )))
  }

  // highlevel updates
  // =

  async addHostingUser (key, userId, denormalizedData = {}) {
    // fetch/create record
    var archiveRecord = await this.getOrCreateByKey(key)

    // remove old indexes
    await this.indexer.removeIndexes(archiveRecord)

    // include denormalized (non-authoritative) data
    if (typeof denormalizedData.ownerName !== 'string') {
      throw new Error('Must include denormalized data (ownerName)')
    }
    archiveRecord.name = denormalizedData.name
    archiveRecord.ownerName = denormalizedData.ownerName

    // add user
    if (!archiveRecord.hostingUsers.includes(userId)) {
      // TEMPORARY
      // only allow one hosting user per archive
      if (archiveRecord.hostingUsers.length > 0) {
        let err = new Error('Cant add another user')
        err.alreadyHosted = true
        throw err
      }
      archiveRecord.hostingUsers.push(userId)
    }

    // update records
    await this._put(archiveRecord)
    await this.indexer.addIndexes(archiveRecord)
    this.emit('add-hosting-user', {key, userId}, archiveRecord)

    // track dead archives
    /* dont await */ this.updateDeadArchives(key, archiveRecord.hostingUsers.length)
  }

  async removeHostingUser (key, userId) {
    // fetch/create record
    var archiveRecord = await this.getOrCreateByKey(key)

    // remove old indexes
    await this.indexer.removeIndexes(archiveRecord)

    // remove user
    var index = archiveRecord.hostingUsers.indexOf(userId)
    if (index === -1) {
      return // not already hosting
    }
    archiveRecord.hostingUsers.splice(index, 1)

    // update records
    await this._put(archiveRecord)
    if (archiveRecord.hostingUsers.length > 0) {
      await this.indexer.addIndexes(archiveRecord) // only readd indexes if there are hosting users
    }
    this.emit('remove-hosting-user', {key, userId}, archiveRecord)

    // track dead archives
    /* dont await */ this.updateDeadArchives(key, archiveRecord.hostingUsers.length)
  }

  // internal tracking
  // =

  listDeadArchiveKeys () {
    return new Promise((resolve, reject) => {
      collect(this.deadArchivesDB.createKeyStream(), (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
  }

  async updateDeadArchives (key, numHostingUsers) {
    try {
      if (numHostingUsers === 0) {
        await this.deadArchivesDB.put(key, '')
      } else {
        await this.deadArchivesDB.del(key)
      }
    } catch (e) {}
  }
}
module.exports = ArchivesDB

// default user-record values
ArchivesDB.defaults = () => ({
  key: null,

  hostingUsers: [], // NOTE currently just 1 entry is allowed

  // denormalized data
  name: false, // stored canonically in the hosting user record
  ownerName: '', // stored canonically in the hosting user record

  // stats
  diskUsage: undefined,
  numBlocks: 0,
  numDownloadedBlocks: 0,
  numBytes: 0,
  numFiles: 0,

  updatedAt: 0,
  createdAt: 0
})
