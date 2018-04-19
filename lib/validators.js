const bytes = require('bytes')
const { DAT_URL_REGEX, DAT_KEY_REGEX, DAT_NAME_REGEX } = require('./const')

exports.isDatURL = value => {
  return DAT_URL_REGEX.test(value)
}

exports.isDatHash = value => {
  return value.length === 64 && DAT_KEY_REGEX.test(value)
}

exports.isDatHashOrURL = value => {
  return exports.isDatURL(value) || exports.isDatHash(value)
}

exports.isDatName = value => {
  return DAT_NAME_REGEX.test(value)
}

exports.isScopesArray = value => {
  return Array.isArray(value) && value.filter(v => typeof v !== 'string').length === 0
}

exports.isSimpleEmail = value => {
  return typeof value === 'string'
}

exports.isPassword = value => {
  return typeof value === 'string' && value.length >= 6 && value.length <= 100
}

exports.isBytes = value => {
  return value === null || typeof value === 'number' || !!bytes(value)
}
