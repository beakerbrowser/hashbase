const path = require('path')
const rimraf = require('rimraf')
const Dat = require('dat-node')
const util = require('./util')

exports.makeDatFromFolder = function (dir, cb) {
  rimraf.sync(path.join(dir, '.dat'))
  Dat(dir, (err, dat) => {
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
  Dat(dir, {key}, (err, dat) => {
    if (err) return cb(err)

    dat.joinNetwork()
    dat.network.once('connection', (...args) => {
      console.log('got connection')
    })

    dat.archive.metadata.on('download', (index, block) => {
      console.log('meta download event', index)
    })

    var to = setTimeout(() => cb(new Error('timed out waiting for download')), timeout)
    dat.archive.metadata.on('sync', () => {
      console.log('meta download finished')
    })
    dat.archive.once('content', () => {
      console.log('opened')
      dat.archive.content.on('download', (index, block) => {
        console.log('content download event', index)
      })
      dat.archive.content.on('sync', () => {
        console.log('content download finished')
        clearTimeout(to)
        dat.close()
        cb(null, dat, key)
      })
    })
  })
}
