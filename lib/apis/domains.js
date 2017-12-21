const {UnprocessableEntityError, ForbiddenError} = require('../const')
const {randomBytes} = require('../crypto')
const lock = require('../lock')

// exported api
// =

module.exports = class DomainsAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.domainsDB = cloud.domainsDB
  }

  async add (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('user')) throw new ForbiddenError()
    const {sessionUser} = res.locals

    // validate & sanitize input
    req.checkBody('archiveKey').isDatHash()
    req.checkBody('domain')
      .isFQDN().withMessage('Must provide a valid domain name.')
    ;(await req.getValidationResult()).throw()
    const {archiveKey, domain} = req.body

    // generate verification nonce
    const domainVerifyNonce = (await randomBytes(16)).toString('hex')

    const release = await lock('domains')
    try {
      // make sure the domain record doesn't already exist
      let domainRecords = await this.domainsDB.listByDomain(domain)
      if (domainRecords.filter(r => r.isVerified).length > 0) { // confirmed by any user
        throw new UnprocessableEntityError('This domain has already been assigned to another archive.')
      }
      if (domainRecords.filter(r => r.userId === sessionUser.id).length > 0) { // by the current user
        throw new UnprocessableEntityError('This domain has already been assigned to another archive.')
      }

      // create the new domain record
      await this.domainsDB.create({domain, archiveKey, userId: sessionUser.id, domainVerifyNonce})
    } finally {
      release()
    }

    // respond
    res.status(200).json({domainVerifyNonce})
  }

  async validate (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('user')) throw new ForbiddenError()

    // TODO

    // respond
    res.status(200).end()
  }

  async remove (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()
    if (!res.locals.session.scopes.includes('user')) throw new ForbiddenError()
    const {sessionUser} = res.locals

    const {id} = req.body
    if (!id) {
      throw new UnprocessableEntityError('The ID field is required.')
    }

    const release = await lock('domains')
    try {
      // make sure the user owns the domain record
      const domainRecord = await this.domainsDB.getByID(id)
      if (!domainRecord) {
        throw new UnprocessableEntityError('No domain record was found at the given URL.')
      }
      if (domainRecord.userId !== sessionUser.id) {
        throw new ForbiddenError('You do not own this domain record.')
      }

      // delete the domain record
      await this.domainsDB.del(domainRecord)
    } finally {
      release()
    }

    // respond
    res.status(200).end()
  }
}
