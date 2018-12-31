const {NotFoundError} = require('../const')
const nicedate = require('nicedate')
const bytes = require('bytes')

class UserContentAPI {
  constructor (cloud) {
    this.cloud = cloud
    this.config = cloud.config
  }

  async viewArchive (req, res) {
    var {session} = res.locals

    // validate & sanitize input
    req.checkParams('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkParams('archivename').isDatName().isLength({ min: 1, max: 64 })
    ;(await req.getValidationResult()).throw()
    var {username, archivename} = req.params

    // lookup user
    var userRecord = await this.cloud.usersDB.getByUsername(username)
    if (!userRecord) throw new NotFoundError()

    // lookup archive
    var userArchiveRecord = userRecord.archives.find(a => a.name === archivename || a.key === archivename)
    if (!userArchiveRecord) throw new NotFoundError()
    var archiveRecord = await this.cloud.archivesDB.getByKey(userArchiveRecord.key)
    var isOwner = session && session.id === userRecord.id
    archivename = userArchiveRecord.name || ''

    // figure out url
    var niceUrl = `${archivename}.${this.config.hostname}`

    // load progress
    var progress
    if (isOwner) {
      progress = await this.cloud.archiver.getDownloadProgress(archiveRecord.key)
    }

    // load manifest data
    var title = ''
    var description = ''
    var manifest = await this.cloud.archiver.getManifest(archiveRecord.key)
    if (manifest) {
      title = manifest.title || 'Untitled'
      description = manifest.description || ''
    }

    // load additional data
    var archive = this.cloud.archiver.getArchive(archiveRecord.key)

    res.render('archive', {
      username,
      key: archiveRecord.key,
      archivename,
      title,
      description,
      isFeatured: archiveRecord.isFeatured,
      niceUrl,
      rawUrl: `dat://${archiveRecord.key}/`,
      progress: (progress * 100) | 0,
      diskUsage: bytes(archive ? archive.diskUsage : 0),
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
    var archives = await Promise.all(userRecord.archives.map(async (archive) => {
      archive = await this.cloud.archivesDB.getExtraByKey(archive.key)
      archive.diskUsage = bytes(archive.diskUsage || 0)
      return archive
    }))

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
