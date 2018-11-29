var EventEmitter = require('events')
var assert = require('assert')
var SQL = require('sql-template-strings') 
var lock = require('../lock')

// exported api
// =

class ArchivesDB extends EventEmitter {
  constructor (cloud) {
    super()
    this.config = cloud.config
    this.archiver = cloud.archiver
    this.sqlite = cloud.db
    this.usersDB = cloud.usersDB
  }

  // basic ops
  // =

  async create (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.key === 'string')
    await this.sqlite.run(SQL`
      INSERT INTO archives (key) VALUES (${record.key})
    `)
    this.emit('create', record)
    return record
  }

  async _put (record) {
    assert(typeof record.key === 'string')
    record.updatedAt = Date.now()
    record = ArchivesDB.serialize(record)

    var query = SQL`UPDATE archives SET`
    for (let k in record) {
      if (k === 'key') continue
      query.append(SQL` ${k} = ${record[k]}`)
    }
    query.append(SQL` WHERE key = ${record.key}`)
    await this.sqlite.run(query)

    this.emit('put', record)
  }

  async update (key, updates) {
    assert(typeof key === 'string')
    assert(updates && typeof updates === 'object')
    return this.put(Object.assign({key}, updates))
  }

  async del (key) {
    if (key && key.key) key = key.key
    assert(typeof key === 'string')
    await this.sqlite.run(SQL`DELETE FROM archives WHERE key = ${key}`)
    this.emit('del', record)
  }

  // getters
  // =

  async getByKey (key) {
    assert(typeof key === 'string')
    var res = await this.sqlite.get(SQL`SELECT * FROM archives WHERE key = ${key}`)
    var hostingUsers = await this.sqlite.all(SQL`SELECT userid FROM users_archives WHERE key = ${key}`)
    res.hostingUsers = hostingUsers.map(({userid}) => userid)
    return ArchivesDB.deserialize(res)
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
    if (!record) return null
    if (record.hostingUsers[0]) {
      record.owner = await this.usersDB.getByID(record.hostingUsers[0])
      record.name = record.owner ? record.owner.archives.find(a => a.key === key).name : ''
      record.niceUrl = record.owner ? `${record.name}.${this.config.hostname}` : null
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
    var res = this.sqlite.get(SQL`
      SELECT archives.* FROM archives
        INNER JOIN users_archives ON users_archives.key = archives.key
        WHERE users_archives.name = ${name}
    `)
    return ArchivesDB.deserialize(res)
  }

  list ({cursor, limit, reverse, sort, featuredOnly, getExtra} = {}) {
    // 'popular' uses a special index
    if (sort === 'popular') {
      return this._listPopular({cursor, limit, reverse})
    }

    // construct query
    var query = SQL`SELECT key FROM archives`
    sort = sort || 'key'
    if (cursor) {
      if (reverse) query.append(SQL` WHERE ${sort} < ${cursor}`)
      else         query.append(SQL` WHERE ${sort} > ${cursor}`)
      if (featuredOnly) {
        query.append(SQL` AND isFeatured = 1`)
      }
    } else {
      if (featuredOnly) {
        query.append(SQL` WHERE isFeatured = 1`)
      }
    }
    query.append(SQL` ORDER BY ${sort}`)
    if (reverse) query.append(SQL` DESC`)
    if (limit) query.append(SQL` LIMIT ${limit}`)

    // run query and grab additional data
    var res = await this.sqlite.all(query)
    if (getExtra) {
      return Promise.all(res.map({key} => this.getExtraByKey(key)))
    } else {
      return Promise.all(res.map({key} => this.getByKey(key)))
    }
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

  async addHostingUser (key, userId, name) {
    // fetch/create record
    var archiveRecord = await this.getOrCreateByKey(key)
    if (archiveRecord.hostingUsers.includes(userId)) {
      return
    }

    // TEMPORARY
    // only allow one hosting user per archive
    if (archiveRecord.hostingUsers.length > 0) {
      let err = new Error('Cant add another user')
      err.alreadyHosted = true
      throw err
    }

    // update records
    await this.sqlite.run(SQL`
      INSERT INTO users_archives
          (key, userid, name)
        VALUES
          (${key}, ${userId}, ${name})
    `)
    this.emit('add-hosting-user', {key, userId}, archiveRecord)
  }

  async removeHostingUser (key, userId) {
    // update records
    await this.sqlite.run(SQL`
      DELETE FROM users_archives WHERE key=${key} AND userid=${userId}
    `)
    this.emit('remove-hosting-user', {key, userId}, archiveRecord)
  }

  // internal tracking
  // =

  listDeadArchiveKeys () {
    return this.sqlite.all(SQL`
      SELECT key FROM archives
        LEFT JOIN users_archives ON users_archives.key = archives.key
        WHERE users_archives.key IS NULL
    `)
  }
  // helpers
  // =

  static serialize (record) {
    var r2 = Object.assign({}, record)
    r2.isFeatured = Number(record.isFeatured)
    return r2
  }

  static deserialize (record) {
    var r2 = Object.assign({}, record)
    r2.isFeatured = Boolean(r2.isFeatured)
    return r2
  }
}
module.exports = ArchivesDB

