const mtb36 = require('monotonic-timestamp-base36')
const ms = require('ms')

// exported api
// =

module.exports.middleware = function (cloud) {
  return (req, res, next) => {
    var peaID = req.cookies['pea-id']
    if (!peaID) {
      // set analytics cookie
      peaID = mtb36()
      res.cookie('pea-id', peaID, {
        domain: cloud.config.hostname,
        httpOnly: true,
        maxAge: ms('1y'),
        sameSite: 'Lax'
      })
    }

    // log request
    cloud.analytics.logEvent({
      url: req.path,
      session: peaID,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      extra: {
        method: req.method,
        user: res.locals.sessionUser ? res.locals.sessionUser.username : null
      }
    })

    next()
  }
}
