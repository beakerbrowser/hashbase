var promisify = require('es6-promisify')

exports.promisify = promisify
exports.promisifyModule = function (module, methods) {
  for (var m of methods) {
    module[m] = promisify(module[m], module)
  }
}
