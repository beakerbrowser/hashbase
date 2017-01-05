var assert = require('assert')
var lock = require('../lock')()
var { randomBytes, hashPassword, verifyPassword } = require('../crypto')
var UsersDB = require('../dbs/users')

// exported api
// =

module.exports = class UsersAPI {
  constructor (cloud) {
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
    let { passwordHash, passwordSalt } = await hashPassword(password)

    var release = await lock(username)
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
      release()
    }

    // send email
    this.mailer.send('verification', { email, username, emailVerificationNonce })

    // respond
    res.status(201).end()
  }

  async verify (req, res) {
    // validate & sanitize input
    req.checkBody('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkBody('nonce').isLength({ min: 3, max: 100 })
    ;(await req.getValidationResult()).throw()
    var { username, nonce } = req.body

    var release = await lock(username)
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
    if (!req.session) {
      return res.status(401).json({
        message: 'You must sign in to access this resource',
        notAuthorized: true
      })
    }

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

    // validate session
    if (!req.session) {
      return res.status(401).json({
        message: 'You must sign in to access this resource',
        notAuthorized: true
      })
    }

    // validate & sanitize input
    req.checkBody('profileURL').isDatURL()
    ;(await req.getValidationResult()).throw()
    req.sanitizeBody('profileURL').toDatDomain()
    var { profileURL } = req.body

    var release = await lock(username)
    try {
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
    } finally {
      release()
    }

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
}