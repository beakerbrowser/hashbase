const { DAT_URL_REGEX } = require('./const')

exports.isDatURL = value => {
  return DAT_URL_REGEX.test(value)
}