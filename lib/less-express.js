var LRU = require('lru-cache')
var less = require('less')
var fs = require('fs')

var globalOptions = {}
var globalLessOptions = {}

function lessExpress (location, lessOptions, options) {
  if (typeof location !== 'string') {
    throw new Error(
      'You need to pass a `location` parameter to generate a `less-express` middleware function.'
    )
  }

  var localLessOptions = Object.assign({
    paths: [location.split('/').slice(0, -1).join('/')]
  }, globalLessOptions, lessOptions)
  var localOptions = Object.assign({}, globalOptions, options)
  var localStaleCache = {}
  var localCache = localOptions.cache === false
    ? null
    : (localOptions.cache || process.env.NODE_ENV === 'production')
      ? new LRU({
        length: function () { return 1 },
        max: 100,
        maxAge: localOptions.cache && typeof localOptions.cache === 'number' ? localOptions.cache : 0,
        dispose: function (key, val) { if (!localStaleCache[key]) localStaleCache[key] = val }
      })
      : null

  if ((localCache && (process.env.NODE_ENV === 'production' && localOptions.precompile !== false)) || localOptions.precompile) {
    localCache.set(location, render(location, localLessOptions))
  }

  return function (req, res, next) {
    if (req.method.toLowerCase() !== 'get' && req.method.toLowerCase() !== 'head') {
      return next()
    }

    function sendOrNext (css) {
      if (localOptions.passThru) {
        res.locals.lessCss = res.locals.lessCss || {}
        res.locals.lessCss[location] = css
        next()
      } else {
        res.set('Content-Type', 'text/css').send(css)
      }
    }

    var result
    if (localCache) {
      result = localCache.get(location)
      if (result) {
        return result.then(sendOrNext)
        .catch(next)
      }
    }
    result = render(location, localLessOptions).then(function (css) {
      sendOrNext(css)
      if (localCache) localCache.set(location, result)
      return css
    })
    .catch(
      localOptions.cache && localOptions.stale
        ? function (err) {
          var lastBuild = localCache && (localCache.get(location) || localStaleCache[location])
          if (lastBuild) {
            return lastBuild.then(sendOrNext)
          } else {
            throw err
          }
        }
        : null
    )
    .catch(next)
  }
}

lessExpress.lessOptions = function (newOpts) {
  globalLessOptions = Object.assign({}, globalLessOptions, newOpts)
  return globalLessOptions
}

lessExpress.options = function (newOpts) {
  globalOptions = Object.assign({}, globalOptions, newOpts)
  return globalOptions
}

function render (location, lessOpts) {
  return new Promise(function (resolve, reject) {
    fs.readFile(location, 'utf-8', function (err, lessString) {
      if (err && err.code === 'ENOENT') err.status = 404
      if (err) return reject(err)
      less.render(lessString, lessOpts || {})
        .then(function (result) {
          resolve(result.css)
        })
        .catch(reject)
    })
  })
};

module.exports = lessExpress
