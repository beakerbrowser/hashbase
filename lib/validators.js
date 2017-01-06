const { DAT_URL_REGEX, DAT_KEY_REGEX } = require('./const')

exports.isDatURL = value => {
  return DAT_URL_REGEX.test(value)
}

exports.isDatHash = value => {
  return value.length === 64 && DAT_KEY_REGEX.test(value)
}