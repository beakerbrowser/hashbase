var assert = require('assert')
var SQL = require('sql-template-strings')

// constants
// =

// valid actions
const ACTIONS = [
  'add-archive',
  'del-archive',
  'update-archive'
]

// exported api
// =

class ActivityDB {
  constructor (cloud) {
    this.sqlite = cloud.db
  }

  async setup () {
    // noop
  }

  // basic ops
  // =

  async writeGlobalEvent (record, opts = {}) {
    assert(record && typeof record === 'object')
    assert(typeof record.userid === 'string', 'Valid userid type')
    assert(typeof record.username === 'string', 'Valid username type')
    assert(ACTIONS.includes(record.action), 'Valid action type')
    if (!opts.doNotModify) {
      record.ts = Date.now()
    }
    var {ts, userid, username, action, params} = ActivityDB.serialize(record)
    await this.sqlite.run(SQL`
      INSERT INTO activity
          (ts, userid, username, action, params)
        VALUES
          (${ts}, ${userid}, ${username}, ${action}, ${params})
    `)
    return record
  }

  async delGlobalEvent (key) {
    assert(typeof key === 'string')
    await this.sqlite.run(SQL`DELETE FROM activity WHERE key = ${key}`)
  }

  // getters
  // =

  async listGlobalEvents ({limit, lt, gt, lte, gte, reverse} = {}) {
    var query = SQL`SELECT * FROM activity`
    if (lt) query.append(SQL` WHERE key < ${lt}`)
    if (lte) query.append(SQL` WHERE key <= ${lte}`)
    if (gt) query.append(SQL` WHERE key > ${gt}`)
    if (gte) query.append(SQL` WHERE key >= ${gte}`)
    if (!reverse) query.append(SQL` ORDER BY key`)
    else query.append(SQL` ORDER BY key DESC`)
    if (limit) query.append(SQL` LIMIT ${limit}`)
    var records = await this.sqlite.all(query)
    return records.map(ActivityDB.deserialize)
  }

  async listUserEvents (username, {limit, lt, gt, lte, gte, reverse} = {}) {
    var query = SQL`SELECT * FROM activity WHERE username = ${username}`
    if (lt) query.append(SQL` AND key < ${lt}`)
    if (lte) query.append(SQL` AND key <= ${lte}`)
    if (gt) query.append(SQL` AND key > ${gt}`)
    if (gte) query.append(SQL` AND key >= ${gte}`)
    if (!reverse) query.append(SQL` ORDER BY key`)
    else query.append(SQL` ORDER BY key DESC`)
    if (limit) query.append(SQL` LIMIT ${limit}`)
    var records = await this.sqlite.all(query)
    return records.map(ActivityDB.deserialize)
  }

  // helpers
  // =

  static serialize (record) {
    if (!record) return null
    var r2 = Object.assign({}, record)
    if ('params' in r2) r2.params = JSON.stringify(record.params)
    return r2
  }

  static deserialize (record) {
    if (!record) return null
    var r2 = Object.assign({}, record)
    if ('params' in r2) r2.params = JSON.parse(r2.params)
    return r2
  }
}
module.exports = ActivityDB
