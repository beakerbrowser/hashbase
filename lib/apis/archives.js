const figures = require('figures')
const bytes = require('bytes')
const sse = require('express-server-sent-events')
const throttle = require('lodash.throttle')
const {DAT_KEY_REGEX, COHORT_STATE_ACTIVE, NotFoundError, UnauthorizedError, ForbiddenError} = require('../const')
const {wait} = require('../helpers')
const lock = require('../lock')

// exported api
// =

module.exports = class ArchivesAPI {
  constructor (cloud) {
    this.activeProgressStreams = 0
    setInterval(() => console.log(figures.info, this.activeProgressStreams, 'active progress streams'), 60e3)

    this.config = cloud.config
    this.usersDB = cloud.usersDB
    this.archivesDB = cloud.archivesDB
    this.activityDB = cloud.activityDB
    this.archiver = cloud.archiver
  }

  async add (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('user')) throw new ForbiddenError()

    // validate & sanitize input
    req.checkBody('key').optional().isDatHash()
    req.checkBody('url').optional().isDatHashOrURL()
    req.checkBody('name').optional()
      .isDatName().withMessage('Names must only contain characters, numbers, and dashes.')
      .isLength({ min: 1, max: 63 }).withMessage('Names must be 1-63 characters long.')
    ;(await req.getValidationResult()).throw()
    if (req.body.url) req.sanitizeBody('url').toDatDomain()
    var { key, url, name } = req.body

    // only allow one or the other
    if ((!key && !url) || (key && url)) {
      return res.status(422).json({
        message: 'Must provide a key or url',
        invalidInputs: true
      })
    }
    if (url) {
      key = DAT_KEY_REGEX.exec(url)[1]
    }

    var release = await Promise.all([lock('users'), lock('archives')])
    try {
      // fetch user's record
      var userRecord = await this.usersDB.getByID(res.locals.session.id)

      // enforce names limit
      if (name) {
        let numNamedArchives = userRecord.archives.filter(a => !!a.name).length
        let limit = userRecord.namedArchiveQuota || this.config.defaultNamedArchivesLimit
        if (numNamedArchives >= limit) {
          return res.status(422).json({
            message: `You can only use ${limit} names. You must upload this archive without a name.`,
            outOfNamedArchives: true
          })
        }
      }

      // check that the user has the available quota
      if (this.config.getUserDiskQuotaPct(userRecord) >= 1) {
        return res.status(422).json({
          message: 'You have exceeded your disk usage',
          outOfSpace: true
        })
      }

      if (name) {
        let isAvailable = true

        // check that the name isnt reserved
        var {reservedNames} = this.config.registration
        if (reservedNames && Array.isArray(reservedNames) && reservedNames.length > 0) {
          if (reservedNames.indexOf(name.toLowerCase()) !== -1) {
            isAvailable = false
          }
        }

        // check that the name isnt taken
        let existingArchive = await this.archivesDB.getByName(name)
        if (existingArchive && existingArchive.key !== key) {
          isAvailable = false
        }

        if (!isAvailable) {
          return res.status(422).json({
            message: `${name} has already been taken. Please select a new name.`,
            details: {
              name: {
                msg: `${name} has already been taken. Please select a new name.`
              }
            }
          })
        }
      }

      // update the records
      try {
        await this.archivesDB.addHostingUser(key, userRecord.id)
      } catch (e) {
        if (e.alreadyHosted) {
          return res.status(422).json({
            message: 'This archive is already being hosted by someone else'
          })
        }
        throw e // internal error
      }
      await this.usersDB.onAddArchive(userRecord.id, key, name)
    } finally {
      release[0]()
      release[1]()
    }

    // record the event
    /* dont await */ req.logAnalytics('add-archive', {user: userRecord.id, key, name})
    /* dont await */ this.usersDB.updateCohort(userRecord, COHORT_STATE_ACTIVE)
    /* dont await */ this.activityDB.writeGlobalEvent({
      userid: userRecord.id,
      username: userRecord.username,
      action: 'add-archive',
      params: {key, name}
    })

    // add to the swarm
    this.archiver.loadArchive(key).then(() => {
      this.archiver._swarmArchive(key, {upload: true, download: true})
    })

    // respond
    res.status(200).end()
  }

  async remove (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('user')) throw new ForbiddenError()

    // validate & sanitize input
    req.checkBody('key').optional().isDatHash()
    req.checkBody('url').optional().isDatHashOrURL()
    ;(await req.getValidationResult()).throw()
    if (req.body.url) req.sanitizeBody('url').toDatDomain()
    var { key, url } = req.body

    // only allow one or the other
    if ((!key && !url) || (key && url)) {
      return res.status(422).json({
        message: 'Must provide a key or url',
        invalidInputs: true
      })
    }
    if (url) {
      key = DAT_KEY_REGEX.exec(url)[1]
    }

    var release = await Promise.all([lock('users'), lock('archives')])
    try {
      // fetch the user
      var userRecord = await this.usersDB.getByID(res.locals.session.id)

      // find the archive name
      var archiveRecord = await this.archivesDB.getExtraByKey(key)
      var name = archiveRecord.name

      // update the records
      if (userRecord.archives.find(a => a.key === key)) {
        await this.archivesDB.removeHostingUser(key, res.locals.session.id)
        await this.usersDB.onRemoveArchive(res.locals.session.id, key)
      }
    } finally {
      release[0]()
      release[1]()
    }

    // record the event
    /* dont await */ req.logAnalytics('remove-archive', {user: userRecord.id, key, name})
    /* dont await */ this.activityDB.writeGlobalEvent({
      userid: userRecord.id,
      username: userRecord.username,
      action: 'del-archive',
      params: {key, name}
    })

    // remove from the swarm
    var archive = await this.archivesDB.getByKey(key)
    if (!archive.hostingUsers.length) {
      /* dont await */ this.archiver.closeArchive(key)
    }

    // respond
    res.status(200).end()
  }

  async list (req, res) {
    // we're getting user-specific information, so only handle this call if logged in
    if (!res.locals.sessionUser) {
      return res.status(200).json({items: []})
    }

    var items = await Promise.all(
      res.locals.sessionUser.archives.map(a => (
        this._getArchiveInfo(res.locals.sessionUser, a)
      ))
    )
    return res.status(200).json({items})
  }

  async get (req, res) {
    if (req.query.view === 'status') {
      return this.archiveStatus(req, res)
    }

    // we're getting user-specific information, so only handle this call if logged in
    if (!res.locals.sessionUser) throw new NotFoundError()

    // lookup archive
    var archive = res.locals.sessionUser.archives.find(a => a.key === req.params.key)
    if (!archive) throw new NotFoundError()

    // give info about the archive
    var info = await this._getArchiveInfo(res.locals.sessionUser, archive)
    return res.json(info)
  }

  async update (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('user')) throw new ForbiddenError()

    // validate & sanitize input
    req.checkBody('name').optional()
      .isDatName().withMessage('Names must only contain characters, numbers, and dashes.')
      .isLength({ min: 1, max: 63 }).withMessage('Names must be 1-63 characters long.')
    ;(await req.getValidationResult()).throw()
    var key = req.params.key
    var { name } = req.body

    var release = await Promise.all([lock('users'), lock('archives')])
    try {
      // fetch user's record
      var userRecord = await this.usersDB.getByID(res.locals.session.id)

      // find the archive
      var archiveRecord = userRecord.archives.find(a => a.key === key)
      if (!archiveRecord) {
        throw new NotFoundError()
      }

      if (name) {
        let isAvailable = true

        // check that the name isnt reserved
        var {reservedNames} = this.config.registration
        if (reservedNames && Array.isArray(reservedNames) && reservedNames.length > 0) {
          if (reservedNames.indexOf(name.toLowerCase()) !== -1) {
            isAvailable = false
          }
        }

        // check that the name isnt taken
        let existingArchive = await this.archivesDB.getByName(name)
        if (existingArchive && existingArchive.key !== key) {
          isAvailable = false
        }

        if (!isAvailable) {
          return res.status(422).json({
            message: `${name} has already been taken. Please select a new name.`,
            details: {
              name: {
                msg: `${name} has already been taken. Please select a new name.`
              }
            }
          })
        }
      }

      // enforce names limit
      if (name && !archiveRecord.name /* only need to check if giving a name to an archive that didnt have one */) {
        let limit = userRecord.namedArchiveQuota || this.config.defaultNamedArchivesLimit
        let numNamedArchives = userRecord.archives.filter(a => !!a.name).length
        if (numNamedArchives >= limit) {
          return res.status(422).json({
            message: `You can only use ${limit} names. You must upload this archive without a name.`,
            outOfNamedArchives: true
          })
        }
      }

      // update the records
      archiveRecord.name = name
      await this.archivesDB.addHostingUser(archiveRecord.key, userRecord.id)
      await this.usersDB.put(userRecord)
    } finally {
      release[0]()
      release[1]()
    }

    // record the event
    /* dont await */ this.activityDB.writeGlobalEvent({
      userid: userRecord.id,
      username: userRecord.username,
      action: 'update-archive',
      params: {key, name}
    })

    // respond
    res.status(200).end()
  }

  async getByName (req, res) {
    // validate & sanitize input
    req.checkParams('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkParams('archivename').isDatName().isLength({ min: 1, max: 64 })
    ;(await req.getValidationResult()).throw()
    var { username, archivename } = req.params

    // lookup user
    var userRecord = await this.usersDB.getByUsername(username)
    if (!userRecord) throw new NotFoundError()

    // lookup archive
    const findFn = (DAT_KEY_REGEX.test(archivename))
      ? a => a.key === archivename
      : a => a.name === archivename
    var archive = userRecord.archives.find(findFn)
    if (!archive) throw new NotFoundError()

    // lookup manifest
    var manifest = await this.archiver.getManifest(archive.key)

    // respond
    res.status(200).json({
      user: username,
      key: archive.key,
      name: archive.name,
      title: manifest ? manifest.title : '',
      description: manifest ? manifest.description : ''
    })
  }

  async archiveStatus (req, res) {
    var type = req.accepts(['json', 'text/event-stream'])
    if (type === 'text/event-stream') {
      sse(req, res, () => this._getArchiveProgressEventStream(req, res))
    } else {
      await this._getArchive(req.params.key) // will throw if the archive is not active
      let progress = await this._getArchiveProgress(req.params.key)
      res.status(200).json({ progress })
    }
  }

  async _getArchive (key) {
    var archive = this.archiver.getArchive(key)
    if (!archive) {
      if (!this.archiver.isLoadingArchive(key)) {
        throw new NotFoundError()
      }
      archive = await this.archiver.loadArchive(key)
    }
    return archive
  }

  async _getArchiveInfo (userRecord, archive) {
    // figure out additional urls
    var additionalUrls = []
    if (archive.name) {
      var niceUrl = `${archive.name}.${this.config.hostname}`
      additionalUrls = [`dat://${niceUrl}`, `https://${niceUrl}`]
    }

    // load manifest data
    var title = ''
    var description = ''
    var manifest = await this.archiver.getManifest(archive.key)
    if (manifest) {
      title = manifest.title || 'Untitled'
      description = manifest.description || ''
    }

    return {
      url: `dat://${archive.key}`,
      name: archive.name,
      title,
      description,
      additionalUrls
    }
  }

  _getArchiveProgressEventStream (req, res) {
    const evt = `progress:${req.params.key}`

    const onProgress = throttle(({progress, diskUsage}) => {
      progress = (progress * 100) | 0
      diskUsage = diskUsage ? bytes(diskUsage) : ''
      res.sse(`data: ${progress} ${diskUsage}\n\n`)
    }, 3e3, {leading: true, trailing: true})

    // send event
    onProgress({progress: this.archiver.getDownloadProgress(req.params.key)})

    // register listener
    this.activeProgressStreams++
    this.archiver.addListener(evt, onProgress)
    res.once('close', () => {
      this.activeProgressStreams--
      this.archiver.removeListener(evt, onProgress)
    })
  }

  async _getArchiveProgress (key) {
    var progress = await Promise.race([
      this.archiver.getDownloadProgress(key),
      wait(5e3, false)
    ])
    return progress || 0
  }
}
