const os = require('os')
const path = require('path')
const fs = require('fs')
const Dat = require('dat-node')
const memdb = require('memdb')

exports.makeDatFromFolder = function (dir, cb) {
  Dat(dir, { db: memdb() }, (err, dat) => {
    if (err) return cb(err)

    dat.importFiles(() => {
      dat.joinNetwork()

      var key = dat.key.toString('hex')
      console.log('created dat', key, 'from', dir)
      cb(null, dat, key)
    })
  })
}

exports.downloadDatFromSwarm = function (key, { timeout = 5e3 }, cb) {
  var dir = mktmp()
  Dat(dir, { key, db: memdb() }, (err, dat) => {
    if (err) return cb(err)

    dat.joinNetwork()
    dat.network.swarm.once('connection', (...args) => {
      console.log('got connection')
    })

    var stats = dat.trackStats()
    stats.on('update', () => console.log('stats', stats.get()))

    dat.archive.metadata.on('download', (index, block) => {
      console.log('download event', index, block.toString())
    })

    var to = setTimeout(() => cb(new Error('timed out waiting for download')), timeout)
    dat.archive.metadata.on('download-finished', () => {
      dat.archive.content.on('download-finished', () => {
        clearTimeout(to)
        dat.close()
        cb(null, dat, key)
      })
    })
  })
}

function mktmp () {
  if (fs.mkdtempSync) {
    return fs.mkdtempSync(os.tmpdir() + path.sep + 'hypercloud-test-')
  }
  var p = (os.tmpdir() + path.sep + 'beaker-test-' + Date.now())
  fs.mkdirSync(p)
  return p
}
