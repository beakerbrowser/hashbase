const os = require('os')
const path = require('path')
const fs = require('fs')
const Dat = require('dat-node')
const memdb = require('memdb')

exports.makeDatFromFolder = function (dir, cb) {
  var dat = Dat({ dir, db: memdb() })
  dat.share(err => {
    if (err) return cb(err)

    var key = dat.archive.key.toString('hex')
    console.log('created dat', key, 'from', dir)
    cb(null, dat, key)
  })
}

exports.downloadDatFromSwarm = function (key, { timeout = 5e3 }, cb) {
  var dir = fs.mkdtempSync(os.tmpdir() + path.sep + 'beaker-test-')
  var dat = Dat({ dir, key, db: memdb() })
  dat.download()
  var to = setTimeout(() => cb(new Error('timed out waiting for download')), timeout)
  dat.on('download-finished', () => {
    clearTimeout(to)
    dat.close()
    cb(null, dat, key)
  })
}
