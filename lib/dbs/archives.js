var EventEmitter = require('events')
var assert = require('assert')
var levelPromise = require('level-promise')
var sublevel = require('subleveldown')
var lock = require('../lock')

// exported api
// =

class ArchivesDB extends EventEmitter {
  constructor (cloud) {
    super()

    // create levels and indexer
    this.archivesDB = sublevel(cloud.db, 'archives', { valueEncoding: 'json' })
    this.deadArchivesDB = sublevel(cloud.db, 'dead-archives')

    // promisify
    levelPromise.install(this.archivesDB)
  }

  // basic ops
  // =

  async create (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.key === 'string')
    record = Object.assign({}, ArchivesDB.defaults, record)
    record.createdAt = Date.now()
    await this.put(record)
    this.emit('create', record)
    return record
  }

  async put (record) {
    assert(typeof record.key === 'string')
    record.updatedAt = Date.now()
    await this.archivesDB.put(record.key, record)
    this.emit('put', record)
  }

  async del (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.key === 'string')
    await this.archivesDB.del(record.key)
    /* dont await */ this.deadArchivesDB.del(record.key)
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

  list () {
    return this.archivesDB.createValueStream()
  }

  // highlevel updates
  // =

  async addHostingUser (key, userId) {
    var release = await lock('archives:update:' + key)
    try {
      // fetch/create record
      var archiveRecord = await this.getOrCreateByKey(key)

      // add user
      if (archiveRecord.hostingUsers.includes(userId)) {
        return // already hosting
      }
      archiveRecord.hostingUsers.push(userId)

      // update records
      await this.put(archiveRecord)
    } finally {
      release()
    }
    this.emit('add-hosting-user', {key, userId}, archiveRecord)

    // track dead archives
    /* dont await */ this.updateDeadArchives(key, archiveRecord.hostingUsers.length)
  }

  async removeHostingUser (key, userId) {
    var release = await lock('archives:update:' + key)
    try {
      // fetch/create record
      var archiveRecord = await this.getOrCreateByKey(key)

      // remove user
      var index = archiveRecord.hostingUsers.indexOf(userId)
      if (index === -1) {
        return // not already hosting
      }
      archiveRecord.hostingUsers.splice(index, 1)

      // update records
      await this.put(archiveRecord)
    } finally {
      release()
    }
    this.emit('remove-hosting-user', {key, userId}, archiveRecord)

    // track dead archives
    /* dont await */ this.updateDeadArchives(key, archiveRecord.hostingUsers.length)
  }

  // internal tracking
  // =

  listDeadArchives () {
    return this.deadArchivesDB.createKeyStream()
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
ArchivesDB.defaults = {
  key: null,

  hostingUsers: [],

  updatedAt: 0,
  createdAt: 0
}
