var path = require('path')
var hyperarchiver = require('hyperarchiver')

module.exports = Hypercloud

function Hypercloud (opts) {
  if (!(this instanceof Hypercloud)) return new Hypercloud(opts)
  if (!opts) opts = {}
  var self = this

  opts.dir = opts.dir || path.join(__dirname, 'hypercloud')
  var hyper = hyperarchiver(opts)

  self.archiver = hyper.archiver
  self.dat = hyper.dat
  self.api = hyper.api
}

Hypercloud.prototype.addUser = function (req, res, cb) {
  this.api.add(req, res, { body: req.body }, (err, code, data) => {
    if (err) return cb(err, code)
    // TODO: set up user archive and read info
    cb(err, code, data)
  })
}
