const Dat = require('dat-js')
const memdb = require('memdb')

exports.shareDat = function (dir, cb) {
  var dat = Dat({ dir, db: memdb() })
  dat.share(err =>{
    if (err) return cb(err)

    var key = dat.archive.key.toString('hex')
    console.log('created dat', key, 'from', dir)
    cb(null, dat, key)
  })
}
