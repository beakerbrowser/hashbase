const {UnauthorizedError, ForbiddenError} = require('../const')

// exported api
// =

module.exports = class ReportsAPI {
  constructor (cloud) {
    this.reportsDB = cloud.reportsDB
    this.usersDB = cloud.usersDB
  }

  async add (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('user')) throw new ForbiddenError()

    // validate & sanitize input
    req.checkBody('archiveKey').isDatHash()
    req.checkBody('archiveOwner').isAlphanumeric()
    req.checkBody('reason').isAlphanumeric()
    ;(await req.getValidationResult()).throw()

    var { archiveKey, archiveOwner, reason } = req.body

    try {
      // fetch the archive owner's record
      var archiveOwnerRecord = await this.usersDB.getByUsername(archiveOwner)
      var report = Object.assign({}, {
        archiveKey,
        archiveOwner: archiveOwnerRecord.id,
        reason,
        reportingUser: res.locals.session.id
      })

      // create the report
      await this.reportsDB.create(report)
    } catch (e) {
      return res.status(422).json({
        message: 'There were errors in your submission'
      })
    }

    // respond
    res.status(200).end()
  }
}
