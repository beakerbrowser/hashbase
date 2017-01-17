var assert = require('assert')
var levelPromise = require('level-promise')
var sublevel = require('subleveldown')
var collect = require('stream-collector')
var mtb36 = require('monotonic-timestamp-base36')

// constants
// =

// valid actions
const ACTIONS = [
  'add-archive',
  'del-archive'
]

// exported api
// =

class ActivityDB {
  constructor (cloud) {
    // create levels
    this.globalActivityDB = sublevel(cloud.db, 'global-activity', { valueEncoding: 'json' })

    // promisify
    levelPromise.install(this.globalActivityDB)
  }

  // basic ops
  // =

  async writeGlobalEvent (record) {
    assert(record && typeof record === 'object')
    assert(typeof record.userid === 'string', 'Valid userid type')
    assert(typeof record.username === 'string', 'Valid username type')
    assert(ACTIONS.includes(record.action), 'Valid action type')
    record = Object.assign({}, ActivityDB.defaults, record)
    record.ts = Date.now()
    await this.globalActivityDB.put(mtb36(), record)
    return record
  }

  async delGlobalEvent (key) {
    assert(typeof key === 'string')
    await this.globalActivityDB.del(key)
  }

  // getters
  // =

  listGlobalEvents (opts) {
    return new Promise((resolve, reject) => {
      collect(this.globalActivityDB.createReadStream(opts), (err, res) => {
        if (err) reject(err)
        else resolve(res.map(toNiceObj))
      })
    })
  }

}
module.exports = ActivityDB

// default user-record values
ActivityDB.defaults = {
  ts: null,
  userid: null,
  username: null,
  action: null,
  params: {}
}

// helper to convert {key:, value:} to just {values...}
function toNiceObj (obj) {
  obj.value.key = obj.key
  return obj.value
}
