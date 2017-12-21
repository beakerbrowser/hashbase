const {NotFoundError, ForbiddenError} = require('../const')
const nicedate = require('nicedate')

class UserContentAPI {
  constructor (cloud) {
    this.cloud = cloud
    this.config = cloud.config
  }

  async viewArchive (req, res) {
    var {session} = res.locals

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
    var domains = []
    if (isOwner) {
      domains = await this.cloud.domainsDB.listByArchiveKey(archive.key)
      domains = domains.filter(r => r.userId === session.id)
    }

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
      domains,
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

  async viewDomain (req, res) {
    // validate & sanitize input
    req.checkParams('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkParams('archivename').isDatName().isLength({ min: 3, max: 64 })
    ;(await req.getValidationResult()).throw()
    var {username, archivename, domain} = req.params

    // require a session
    var {session, sessionUser} = res.locals
    if (!session) {
      if (domain) return res.redirect(`/login?redirect=${username}/${archivename}/domains/${domain}`)
      return res.redirect(`/login?redirect=${username}/${archivename}/new-domain`)
    }

    // can only view if the user or an admin
    if ((!sessionUser || sessionUser.username !== username) && !session.scopes.includes('admin:dats')) {
      throw new ForbiddenError()
    }

    // lookup archive
    var archive = sessionUser.archives.find(a => a.name === archivename)
    if (!archive) throw new NotFoundError()

    // lookup domain if given
    var domainRecord
    if (domain) {
      domainRecord = await this.cloud.domainsDB.getByDomainAndUserId(domain, session.id)
    }

    res.render('archive-domain', {
      username,
      archivename,
      archiveKey: archive.key,
      isNewDomain: !domain || !domainRecord,
      domain,
      domainRecord,
      csrfToken: req.csrfToken()
    })
  }
}

module.exports = UserContentAPI
