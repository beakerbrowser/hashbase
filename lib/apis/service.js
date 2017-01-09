var {NotImplementedError} = require('../const')

// exported api
// =

module.exports = class ServicesAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.usersDB = cloud.usersDB
  }

  async frontpage (req, res) {
    var {session} = res.locals
    var contentType = req.accepts(['html', 'json'])
    if (contentType === 'json') throw new NotImplementedError()

    // TODO
    // if (req.query.view === 'status') {
    //   cloud.api.archives.status((err, code, data) => {
    //     if (err) res.status(code).send(err.message)
    //     res.status(code).json(data)
    //   })
    // }

    // load user, if applicable
    var userRecord = false
    if (session) {
      userRecord = await this.usersDB.getByID(session.id)
    }

    // respond
    res.render('frontpage', {
      userRecord,
      verified: req.query.verified
    })
  }

  async explore (req, res) {
    var users = await this.usersDB.list()
    res.render('explore', {users})
  }

  async about (req, res) {
    res.render('about')
  }

  async terms (req, res) {
    res.render('terms')
  }

  async privacy (req, res) {
    res.render('privacy')
  }

  async support (req, res) {
    res.render('support')
  }

  async notfound (req, res) {
    res.render('404')
  }
}
