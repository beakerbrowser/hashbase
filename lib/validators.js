const { DAT_URL_REGEX, DAT_KEY_REGEX, DAT_NAME_REGEX } = require('./const')

exports.isDatURL = value => {
  return DAT_URL_REGEX.test(value)
}

exports.isDatHash = value => {
  return value.length === 64 && DAT_KEY_REGEX.test(value)
}

exports.isDatName = value => {
  return DAT_NAME_REGEX.test(value)
}

exports.isScopesArray = value => {
  return Array.isArray(value) && value.filter(v => typeof v !== 'string').length === 0
}
