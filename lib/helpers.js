var promisify = require('es6-promisify')
var through2 = require('through2')
var identifyFiletype = require('identify-filetype')
var mime = require('mime')

// config default mimetype
mime.default_type = 'text/plain'

exports.promisify = promisify
exports.promisifyModule = function (module, methods) {
  for (var m of methods) {
    module[m] = promisify(module[m], module)
  }
}

exports.pluralize = function (num, base, suffix = 's') {
  if (num === 1) {
    return base
  }
  return base + suffix
}

exports.makeSafe = function (str) {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;').replace(/"/g, '')
}

var identify =
exports.identify = function (name, chunk) {
  // try to identify the type by the chunk contents
  var mimeType
  var identifiedExt = (chunk) ? identifyFiletype(chunk) : false
  if (identifiedExt) {
    mimeType = mime.lookup(identifiedExt)
  }
  if (!mimeType) {
    // fallback to using the entry name
    mimeType = mime.lookup(name)
  }

  // hackish fix
  // the svg test can be a bit aggressive: html pages with
  // inline svgs can be falsely interpretted as svgs
  // double check that
  if (identifiedExt === 'svg' && mime.lookup(name) === 'text/html') {
    return 'text/html'
  }

  return mimeType
}

exports.identifyStream = function (name, cb) {
  var first = true
  return through2(function (chunk, enc, cb2) {
    if (first) {
      first = false
      cb(identify(name, chunk))
    }
    this.push(chunk)
    cb2()
  })
}

exports.wait = function (ms, value) {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), ms)
  })
}

exports.ucfirst = function (str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// from https://github.com/expressjs/vhost/
exports.getRequestHostname = function (req) {
  var host = req.headers.host

  if (!host) {
    return
  }

  var offset = host[0] === '['
    ? host.indexOf(']') + 1
    : 0
  var index = host.indexOf(':', offset)

  return index !== -1
    ? host.substring(0, index)
    : host
}

