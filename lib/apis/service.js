var {NotImplementedError} = require('../const')

// exported api
// =

module.exports = class ServicesAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.usersDB = cloud.usersDB
    this.activityDB = cloud.activityDB
  }

  async frontpage (req, res, next) {
    var contentType = req.accepts(['html', 'json'])
    if (contentType === 'json') throw new NotImplementedError()
    next()
  }

  async explore (req, res, next) {
    if (req.query.view === 'activity') {
      return res.json({
        activity: await this.activityDB.listGlobalEvents({
          limit: 25,
          lt: req.query.start,
          reverse: true
        })
      })
    }
    next()
  }
}
