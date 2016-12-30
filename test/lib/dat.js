const Dat = require('dat-node')
const memdb = require('memdb')
const util = require('./util')

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
  var dir = util.mktmpdir()
  Dat(dir, { key, db: memdb() }, (err, dat) => {
    if (err) return cb(err)

    dat.joinNetwork()
    dat.network.swarm.once('connection', (...args) => {
      console.log('got connection')
    })

    var stats = dat.trackStats()
    stats.on('update', () => console.log('stats', stats.get()))

    dat.archive.metadata.on('download', (index, block) => {
      console.log('meta download event', index, block.toString())
    })

    var to = setTimeout(() => cb(new Error('timed out waiting for download')), timeout)
    dat.archive.metadata.on('download-finished', () => {
      console.log('meta download finished')
    })
    dat.archive.open(() => {
      console.log('opened')
      dat.archive.content.on('download', (index, block) => {
        console.log('content download event', index, block.toString())
      })
      dat.archive.content.on('download-finished', () => {
        console.log('content download finished')
        clearTimeout(to)
        dat.close()
        cb(null, dat, key)
      })
    })
  })
}
