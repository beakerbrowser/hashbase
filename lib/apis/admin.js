const {NotFoundError, UnauthorizedError, ForbiddenError, NotImplementedError} = require('../const')

// exported api
// =

module.exports = class AdminAPI {
  constructor (cloud) {
    this.usersDB = cloud.usersDB
  }

  async listUsers (req, res) {
    // check perms
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('admin:users')) throw new ForbiddenError()

    // fetch
    var users = await this.usersDB.list({
      cursor: req.query.cursor,
      limit: req.query.limit ? +req.query.limit : 25,
      sort: req.query.sort,
      reverse: +req.query.reverse === 1
    })

    // respond
    res.status(200)
    res.json({users})
  }

  async getUser (req, res) {
    // check perms
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('admin:users')) throw new ForbiddenError()

    // respond
    var user = await this.usersDB.getByID(req.params.id)
    if (!user) {
      user = await this.usersDB.getByUsername(req.params.id)
      if (!user) {
        user = await this.usersDB.getByEmail(req.params.id)
        if (!user) {
          throw new NotFoundError()
        }
      }
    }
    res.status(200)
    res.json(user)
  }

  async suspendUser (req, res) {
    // TODO
    throw new NotImplementedError()
  }

  async unsuspendUser (req, res) {
    // TODO
    throw new NotImplementedError()
  }
}
