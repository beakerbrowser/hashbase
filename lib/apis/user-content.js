const {NotFoundError} = require('../const')
const nicedate = require('nicedate')

class UserContentAPI {
  constructor (cloud) {
    this.cloud = cloud
    this.config = cloud.config
  }

  async viewArchive (req, res) {
    var {session, sessionUser} = res.locals

    // validate & sanitize input
    req.checkParams('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkParams('archivename').isDatName().isLength({ min: 3, max: 64 })
    ;(await req.getValidationResult()).throw()
    var {username, archivename} = req.params

    // lookup user
    var userRecord = await this.cloud.usersDB.getByUsername(username)
    if (!userRecord) throw new NotFoundError()

    // lookup archive
    var archive = userRecord.archives.find(a => a.name === archivename)
    if (!archive) throw new NotFoundError()
    var isOwner = session && session.id === userRecord.id

    // figure out url
    var niceUrl = archivename === username
      ? `${username}.${this.config.hostname}`
      : `${archivename}-${username}.${this.config.hostname}`

    // load progress
    var progress
    if (isOwner) {
      progress = await this.cloud.api.archives._getArchiveProgress(archive.key)
    }

    // load manifest data
    var title = ''
    var description = ''
    var manifest = await this.cloud.archiver.getManifest(archive.key)
    if (manifest) {
      title = manifest.title || 'Untitled'
      description = manifest.description || ''
    }

    // load additional data
    var isFeatured = await this.cloud.featuredArchivesDB.has(archive.key)

    res.render('archive', {
      username,
      key: archive.key,
      archivename,
      title,
      description,
      isFeatured,
      niceUrl,
      rawUrl: `dat://${archive.key}/`,
      progress: (progress * 100) | 0,
      diskUsage: archive.diskUsage,
      isOwner,
      csrfToken: req.csrfToken()
    })
  }

  async viewUser (req, res) {
    // validate & sanitize input
    req.checkParams('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    ;(await req.getValidationResult()).throw()
    var {username} = req.params

    // lookup user
    var userRecord = await this.cloud.usersDB.getByUsername(username)
    if (!userRecord) throw new NotFoundError()

    // lookup user's activity
    var activity = await this.cloud.activityDB.listUserEvents(username, {
      limit: 25,
      lt: req.query.start,
      reverse: true
    })

    // fetch more archive data
    var archives = await Promise.all(userRecord.archives.map(archive => (
      this.cloud.archivesDB.getExtraByKey(archive.key)
    )))

    res.render('user', {
      userRecord,
      archives,
      activity,
      nicedate,
      activityLimit: 25,
      csrfToken: req.csrfToken()
    })
  }
}

module.exports = UserContentAPI

