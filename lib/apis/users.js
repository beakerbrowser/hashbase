var assert = require('assert')
var querystring = require('querystring')
var {randomBytes, hashPassword, verifyPassword} = require('../crypto')
var {UnauthorizedError} = require('../const')
var lock = require('../lock')

// exported api
// =

module.exports = class UsersAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.usersDB = cloud.usersDB
    this.sessions = cloud.sessions
    this.proofs = cloud.proofs
    this.mailer = cloud.mailer
  }

  async register (req, res) {
    // validate & sanitize input
    req.checkBody('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkBody('email').isEmail().isLength({ min: 3, max: 100 })
    req.checkBody('password').isLength({ min: 3, max: 100 })
    ;(await req.getValidationResult()).throw()
    var { username, email, password } = req.body

    // allocate email verification nonce
    let emailVerificationNonce = (await randomBytes(32)).toString('hex')

    // salt and hash password
    let {passwordHash, passwordSalt} = await hashPassword(password)

    var release = await Promise.all([
      lock('users:username:' + username),
      lock('users:email:' + email)
    ])
    try {
      // check email & username availability
      if (await this.usersDB.isEmailTaken(email)) {
        return res.status(422).json({
          message: 'Email is not available',
          emailNotAvailable: true
        })
      }
      if (await this.usersDB.isUsernameTaken(username)) {
        return res.status(422).json({
          message: 'Username is not available',
          usernameNotAvailable: true
        })
      }

      // create user record
      await this.usersDB.create({
        username,
        email,
        passwordHash,
        passwordSalt,
        emailVerificationNonce
      })
    } finally {
      release[0]()
      release[1]()
    }

    // send email
    var qs = querystring.stringify({
      username, nonce: emailVerificationNonce
    })
    this.mailer.send('verification', {
      email,
      username,
      emailVerificationNonce,
      emailVerificationLink: `https://${this.config.hostname}/v1/verify?${qs}`
    })

    // respond
    res.status(201).end()
  }

  async verify (req, res) {
    // validate & sanitize input
    req.check('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.check('nonce').isLength({ min: 3, max: 100 })
    ;(await req.getValidationResult()).throw()
    var username = req.query.username || req.body.username
    var nonce = req.query.nonce || req.body.nonce

    var release = await lock('users:username:' + username)
    try {
      // fetch user record
      var userRecord = await this.usersDB.getByUsername(username)
      if (!userRecord) {
        return res.status(422).json({
          message: 'Invalid username',
          invalidUsername: true
        })
      }

      // compare email nonce
      if (nonce !== userRecord.emailVerificationNonce) {
        return res.status(422).json({
          message: 'Invalid verification code',
          invalidNonce: true
        })
      }

      // update user record
      userRecord.emailVerificationNonce = null
      userRecord.isEmailVerified = true
      if (!userRecord.scopes.includes('user')) {
        userRecord.scopes.push('user')
      }
      await this.usersDB.put(userRecord)
    } finally {
      release()
    }

    // send email
    this.mailer.send('welcome', userRecord)

    // respond
    res.status(200).end()
  }

  async getAccount (req, res) {
    // validate session
    if (!req.session) throw new UnauthorizedError()

    // fetch user record
    var userRecord = await this.usersDB.getByID(req.session.id)
    if (!userRecord) {
      return res.status(500).json({
        message: 'Session user record not found',
        userRecordNotFound: true
      })
    }

    // respond
    res.status(200).json({
      email: userRecord.email,
      username: userRecord.username,
      profileURL: userRecord.profileURL,
      profileVerifyToken: userRecord.profileVerifyToken
    })
  }

  async updateAccount (req, res) {
    // TODO: support username changes -prf
    // TODO: support profileURL changes -prf

    // validate session
    if (!req.session) throw new UnauthorizedError()

    // validate & sanitize input
    req.checkBody('profileURL').isDatURL()
    ;(await req.getValidationResult()).throw()
    req.sanitizeBody('profileURL').toDatDomain()
    var { profileURL } = req.body

    // fetch user record
    var userRecord = await this.usersDB.getByID(req.session.id)
    if (!userRecord) {
      return res.status(500).json({
        message: 'Session user record not found',
        userRecordNotFound: true
      })
    }

    // new profile dat?
    if (profileURL && profileURL !== userRecord.profileURL) {
      // remove old profile-dat from swarm
      // TODO

      // add new profile-dat to swarm
      // TODO

      // generate a new proof & update record
      userRecord.profileVerifyToken = this.proofs.generate(userRecord)
      userRecord.isProfileDatVerified = false
      userRecord.profileURL = profileURL
    }

    // update user record
    await this.usersDB.put(userRecord)

    // respond
    res.status(200).end()
  }

  async login (req, res) {
    // validate & sanitize input
    req.checkBody('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkBody('password').isLength({ min: 3, max: 100 })
    ;(await req.getValidationResult()).throw()
    var { username, password } = req.body

    try {
      // fetch user record & check credentials
      var userRecord = await this.usersDB.getByUsername(username)
      assert(userRecord.isEmailVerified)
      assert(verifyPassword(password, userRecord))
    } catch (e) {
      return res.status(422).json({
        message: 'Invalid username/password',
        invalidCredentials: true
      })
    }

    // generate session token
    var sessionToken = this.sessions.generate(userRecord)

    // respond
    res.status(200).json({ sessionToken })
  }

  async logout (req, res) {
    // TODO remove? -prf
  }

  async get (req, res) {
    // validate & sanitize input
    req.checkParams('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    ;(await req.getValidationResult()).throw()
    var { username } = req.params

    // lookup user
    var userRecord = await this.usersDB.getByUsername(username)
    if (!userRecord) throw new NotFoundError()

    // respond
    switch (req.query.view) {
      case 'dats':
        res.status(200).json({
          dats: userRecord.archives
        })
        break

      default:
        res.status(200).json({
          username,
          createdAt: userRecord.createdAt
        })
        break
    }
  }
}
