const fs = require('fs')
const path = require('path')
const extend = require('deep-extend')
const yaml = require('js-yaml')
const figures = require('figures')

function load (name) {
  var str, doc
  var filepath = path.join(__dirname, `../config.${name}.yml`)

  try {
    str = fs.readFileSync(filepath, 'utf8')
  } catch (e) {
    return {}
  }

  try {
    doc = yaml.safeLoad(str)
  } catch (e) {
    console.log('Failed to parse', filepath, e)
    return {}
  }

  return doc
}

// load the config
var env = process.env.NODE_ENV || 'development'
var defaultCfg = load('defaults')
var envCfg = load(env)
module.exports = extend(defaultCfg, envCfg, { env })

// some warnings
if (!module.exports.csrf) {
  console.log(figures.warning, 'WARNING: CSRF is DISABLED')
}
if (!module.exports.stripe) {
  console.log(figures.warning, 'WARNING: Stripe payments are DISABLED')
}
