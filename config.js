var os = require('os')
var path = require('path')
var xtend = require('xtend')

var config = {
  shared: {
    dir: path.join(__dirname, '.hypercloud')
    port: 8080
  },
  development: {},
  production: {
    dir: path.join(os.homedir(), '.hypercloud')
  }
}

var env = process.env.NODE_ENV || 'development'
module.exports = xtend(config.shared, config[env])
