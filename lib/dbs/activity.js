var assert = require('assert')
var levelPromise = require('level-promise')
var sublevel = require('subleveldown')
var collect = require('stream-collector')
var mtb36 = require('monotonic-timestamp-base36')
var through2 = require('through2')

// constants
// =

// used in the users-index-db
const SEPARATOR = '!'
const USERKEY = (key, username) => `${username}${SEPARATOR}${key}`

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
    this.usersIndexDB = sublevel(cloud.db, 'global-activity-users-index')

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
    record = Object.assign({}, ActivityDB.defaults(), record)
    record.ts = Date.now()
    var key = mtb36()
    await Promise.all([
      this.globalActivityDB.put(key, record),
      this.usersIndexDB.put(USERKEY(key, record.username), null)
    ])
    return record
  }

  async delGlobalEvent (key) {
    assert(typeof key === 'string')
    var record = await this.globalActivityDB.get(key)
    await Promise.all([
      this.globalActivityDB.del(key),
      this.usersIndexDB.del(USERKEY(key, record.username))
    ])
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

  listUserEvents (username, opts = {}) {
    return new Promise((resolve, reject) => {
      // update the start/end
      if (opts.lt) opts.lt = USERKEY(opts.lt, username)
      if (opts.gt) opts.gt = USERKEY(opts.gt, username)
      if (opts.lte) opts.lte = USERKEY(opts.lte, username)
      if (opts.gte) opts.gte = USERKEY(opts.gte, username)

      // set range edges
      if (!opts.lt && !opts.lte) {
        opts.lte = USERKEY('\xff', username)
      }
      if (!opts.gt && !opts.gte) {
        opts.gt = USERKEY('', username)
      }

      // fetch the index range
      var self = this
      var stream = this.usersIndexDB.createReadStream(opts)
        .pipe(through2.obj(function (entry, enc, cb) {
          // load the record
          var key = entry.key.split(SEPARATOR)[1]
          self.globalActivityDB.get(key, (err, value) => {
            if (value) {
              value.key = key
              this.push(value)
            }
            cb()
          })
        }))
      collect(stream, (err, res) => {
        if (err) reject(err)
        else resolve(res) // no need to use toNiceObj
      })
    })
  }
}
module.exports = ActivityDB

// default user-record values
ActivityDB.defaults = () => ({
  ts: null,
  userid: null,
  username: null,
  action: null,
  params: {}
})

// helper to convert {key:, value:} to just {values...}
function toNiceObj (obj) {
  obj.value.key = obj.key
  return obj.value
}
