var AwaitLock = require('await-lock')

// wraps await-lock in a simpler interface, with many possible locks
// usage:
/*
var lock = require('./lock')()
async function foo () {
  var release = await lock('bar')
  // ...
  release()
}
*/

module.exports = function () {
  var locks = {}
  return async function (key) {
    if (!(key in locks)) locks[key] = new AwaitLock()
    await locks[key].acquireAsync()
    return () => locks[key].release()
  }
}