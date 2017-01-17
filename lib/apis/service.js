var fs = require('fs')
var path = require('path')
var yaml = require('js-yaml')
var nicedate = require('nicedate')
var {NotImplementedError} = require('../const')

// exported api
// =

module.exports = class ServicesAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.usersDB = cloud.usersDB
    this.activityDB = cloud.activityDB
    this._contributors = []
    this._loadContribsFile()
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
      verified: req.query.verified,
      nicedate,
      activityLimit: 25,
      activity: await this.activityDB.listGlobalEvents({
        limit: 25,
        lt: req.query.start,
        reverse: true
      })
    })
  }

  async explore (req, res) {
    var contentType = req.accepts(['html', 'json'])
    if (contentType === 'json') {
      // json views
      if (req.query.view === 'activity') {
        return res.json({
          activity: await this.activityDB.listGlobalEvents({
            limit: 25,
            lt: req.query.start,
            reverse: true
          })
        })
      }
    }

    // html views
    if (req.query.view === 'activity') {
      return res.render('explore-activity', {
        nicedate,
        activityLimit: 25,
        activity: await this.activityDB.listGlobalEvents({
          limit: 25,
          lt: req.query.start,
          reverse: true
        })
      })
    }
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

  async contributors (req, res) {
    res.render('contributors', { contributors: this._contributors })
  }

  async notfound (req, res) {
    res.render('404')
  }

  _loadContribsFile () {
    try {
      var filepath = path.join(__dirname, '../../contributors.yml')
      var str = fs.readFileSync(filepath, 'utf8')
      yaml.safeLoadAll(str, doc => this._contributors.push(doc))
    } catch (e) {
      console.error('Failed to load contributors.yml', e)
    }
  }
}
