const { DAT_URL_REGEX } = require('./const')

exports.toDatDomain = value => {
  return DAT_URL_REGEX.exec(value)[1] + '/'
}
