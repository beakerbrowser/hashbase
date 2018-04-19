const bytes = require('bytes')
const { DAT_KEY_REGEX } = require('./const')

exports.toDatDomain = value => {
  return 'dat://' + DAT_KEY_REGEX.exec(value)[1] + '/'
}

exports.toBytes = value => {
  return bytes.parse(value)
}

exports.toLowerCase = value => value.toLowerCase()
