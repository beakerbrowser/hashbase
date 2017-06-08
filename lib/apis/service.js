var {NotImplementedError} = require('../const')

// exported api
// =

module.exports = class ServicesAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.usersDB = cloud.usersDB
    this.activityDB = cloud.activityDB
    this.archivesDB = cloud.archivesDB
    this.featuredArchivesDB = cloud.featuredArchivesDB
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
    if (req.query.view === 'featured') {
      return res.json({
        featured: (await this.featuredArchivesDB.list()).map(mapArchiveObject)
      })
    }
    if (req.query.view === 'popular') {
      return res.json({
        popular: (await this.archivesDB.list({
          sort: 'popular',
          limit: 25,
          cursor: req.query.start
        })).map(mapArchiveObject)
      })
    }
    if (req.query.view === 'recent') {
      return res.json({
        recent: (await this.archivesDB.list({
          sort: 'createdAt',
          limit: 25,
          cursor: req.query.start
        })).map(mapArchiveObject)
      })
    }
    next()
  }
}

function mapArchiveObject (archive) {
  return {
    key: archive.key,
    numPeers: archive.numPeers,
    name: archive.name,
    title: archive.manifest ? archive.manifest.title : null,
    description: archive.manifest ? archive.manifest.description : null,
    owner: archive.owner ? archive.owner.username : null,
    createdAt: archive.createdAt
  }
}
