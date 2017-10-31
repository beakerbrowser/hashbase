const bytes = require('bytes')
const { DAT_URL_REGEX } = require('./const')

exports.toDatDomain = value => {
  return DAT_URL_REGEX.exec(value)[1] + '/'
}

exports.toBytes = value => {
  return bytes.parse(value)
}

exports.toLowerCase = value => value.toLowerCase()
