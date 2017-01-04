var Lock = require('lock')

// wrap locks in a promises interface

module.exports = function () {
  var lock = Lock()
  return async function (key) {
    return new Promise(resolve => lock(key, resolve))
  }
}