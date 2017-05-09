const LE = require('greenlock')
const LEStoreCertbot = require('le-store-certbot')
const LEChallengeSNI = require('le-challenge-sni')
const LESNIAuto = require('le-sni-auto')
const ms = require('ms')
const log = require('debug')('letsencrypt')

module.exports = function (config) {
  var store = LEStoreCertbot.create({
    configDir: config.letsencrypt.configDir,
    debug: config.letsencrypt.debug
  })

  var leSniChallenge = LEChallengeSNI.create({
    debug: config.letsencrypt.debug
  })

  var sni = LESNIAuto.create({
    renewWithin: ms('10d'), // do not renew more than 10 days before expiration
    renewBy: ms('5d') // do not wait more than 5 days before expiration
  })

  var parentDomain = '.' + config.hostname
  function approveDomains ({domain}, certs, cb) {
    if (domain.endsWith(parentDomain)) {
      cb(null, {domains: [domain], agreeTos: true})
    } else {
      cb(new Error('Invalid domain'))
    }
  }

  var server = (config.letsencrypt.debug) ? LE.stagingServerUrl : LE.productionServerUrl
  var le = LE.create({
    server,
    store,
    challenges: {
      'tls-sni-01': leSniChallenge,
      'tls-sni-02': leSniChallenge
    },
    challengeType: 'tls-sni-02', // default
    approveDomains,
    agreeTos: true,
    sni,
    debug: config.letsencrypt.debug,
    log
  })

  return le.middleware()
}
