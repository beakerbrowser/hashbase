var fs = require('fs')
var path = require('path')
var extend = require('deep-extend')
var yaml = require('js-yaml')

function load (name) {
  var str, doc
  var filepath = path.join(__dirname, `../config.${name}.yml`, 'utf8')
  try { str = fs.readFileSync(filepath) }
  catch (e) { return false }
  try { doc = yaml.safeLoad(str) }
  catch (e) {
    console.log('Failed to parse', filepath, e)
    return false
  }
  return doc
}

var defaultCfg = load('default')
var envCfg = load(process.env.NODE_ENV || 'development')
module.exports = extend(defaultCfg, envCfg)
