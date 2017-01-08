var {NotImplementedError} = require('../const')

// exported api
// =

module.exports = class ServicesAPI {
  constructor (cloud) {
    this.config = cloud.config
  }

  async frontpage (req, res) {
    // TODO
    // if (req.query.view === 'status') {
    //   cloud.api.archives.status((err, code, data) => {
    //     if (err) res.status(code).send(err.message)
    //     res.status(code).json(data)
    //   })
    // }

    // respond
    var contentType = req.accepts(['html', 'json'])
    if (contentType === 'json') throw new NotImplementedError()
    res.render('index')
  }

  async explore (req, res) {
    res.render('explore')
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
}
