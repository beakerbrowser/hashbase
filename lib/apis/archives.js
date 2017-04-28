const {DAT_KEY_REGEX, NotFoundError, UnauthorizedError, ForbiddenError, NotImplementedError} = require('../const')
const {wait} = require('../helpers')

// exported api
// =

module.exports = class ArchivesAPI {
  constructor (cloud) {
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
    var userRecord = await this.usersDB.getByID(res.locals.session.id)

    // validate & sanitize input
    req.checkBody('key').optional().isDatHash()
    req.checkBody('url').optional().isDatURL()
    req.checkBody('name').optional()
      .isDatName().withMessage('Names must only contain characters, numbers, and dashes.')
      .isLength({ min: 3, max: 63 }).withMessage('Names must be 3-63 characters long.')
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

    // extract the key from the url
    if (url) {
      key = DAT_KEY_REGEX.exec(url)[1]
    }

    // update the records
    await Promise.all([
      this.usersDB.addArchive(userRecord.id, key, name),
      this.archivesDB.addHostingUser(key, userRecord.id)
    ])

    // record the event
    /* dont await */ this.activityDB.writeGlobalEvent({
      userid: userRecord.id,
      username: userRecord.username,
      action: 'add-archive',
      params: {key, name}
    })

    // add to the swarm
    /* dont await */ this.archiver.loadArchive(key)

    // respond
    res.status(200).end()
  }

  async remove (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('user')) throw new ForbiddenError()
    var userRecord = await this.usersDB.getByID(res.locals.session.id)

    // validate & sanitize input
    req.checkBody('key').optional().isDatHash()
    req.checkBody('url').optional().isDatURL()
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

    // extract the key from the url
    if (url) {
      key = DAT_KEY_REGEX.exec(url)[1]
    }

    // update the records
    await Promise.all([
      this.usersDB.removeArchive(res.locals.session.id, key),
      this.archivesDB.removeHostingUser(key, res.locals.session.id)
    ])

    // record the event
    /* dont await */ this.activityDB.writeGlobalEvent({
      userid: userRecord.id,
      username: userRecord.username,
      action: 'del-archive',
      params: {key}
    })

    // remove from the swarm
    var archive = await this.archivesDB.getByKey(key)
    if (!archive.hostingUsers.length) {
      /* dont await */ this.archiver.closeArchive(key)
    }

    // respond
    res.status(200).end()
  }

  async get (req, res) {
    if (req.query.view === 'status') {
      return this.archiveStatus(req, res)
    }

    // give info about the archive
    // TODO
    throw NotImplementedError()
  }

  async getByName (req, res) {
    // validate & sanitize input
    req.checkParams('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkParams('archivename').isDatName().isLength({ min: 3, max: 64 })
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

    // respond
    res.status(200).json({
      user: username,
      key: archive.key,
      name: archive.name,
      title: null, // TODO
      description: null // TODO
    })
  }

  async archiveStatus (req, res) {
    var progress = await this._getArchiveProgress(req.params.key)
    res.status(200).json({ progress })
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

  async _getArchiveProgress (key) {
    // fetch the archive
    var archive = await Promise.race([
      this._getArchive(key),
      wait(5e3, false)
    ])
    if (!archive) return 0
    var {metadata, content} = archive

    // some data missing, report progress at zero
    if (!metadata || !metadata.length || !content || !content.length) {
      return 0
    }

    // calculate & respond
    var need = metadata.length + content.length
    var remaining = blocksRemaining(metadata) + blocksRemaining(content)
    return (need - remaining) / need
  }
}

function blocksRemaining (feed) {
  var remaining = 0
  for (var i = 0; i < feed.length; i++) {
    if (!feed.has(i)) remaining++
  }
  return remaining
}
