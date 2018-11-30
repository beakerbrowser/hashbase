var sublevel = require('subleveldown')
var collect = require('stream-collector')
var through2 = require('through2')

// exported api
// =

class ActivityDB {
  constructor (db) {
    // create levels
    this.globalActivityDB = sublevel(db, 'global-activity', { valueEncoding: 'json' })
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
