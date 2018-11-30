var EventEmitter = require('events')
var assert = require('assert')
var sublevel = require('subleveldown')
var collect = require('stream-collector')
var through = require('through2')

// exported api
// =

class ArchivesDB extends EventEmitter {
  constructor (db) {
    super()
    this.archivesDB = sublevel(db, 'archives', { valueEncoding: 'json' })
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

  list ({cursor, limit, reverse, sort, getExtra} = {}) {
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
      var stream = this.archivesDB.createValueStream(opts)
      // "join" additional info
      if (getExtra) {
        stream = stream.pipe(through.obj(async (record, enc, cb) => {
          try {
            cb(null, await this.getByKey(record.key))
          } catch (e) {
            cb(e)
          }
        }))
      }
      // collect into an array
      collect(stream, (err, res) => {
        if (err) reject(err)
        else resolve(res.filter(Boolean))
      })
    })
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
