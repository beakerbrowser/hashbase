var assert = require('assert')
var querystring = require('querystring')
var {randomBytes, hashPassword, verifyPassword} = require('../crypto')
var {UnauthorizedError, ForbiddenError, NotFoundError} = require('../const')
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

  async doRegister (req, res) {
    // validate & sanitize input
    req.checkBody('username')
      .isAlphanumeric().withMessage('Can only be letters and numbers.')
      .isLength({ min: 3, max: 16 }).withMessage('Must be 3 to 16 characters.')
    req.checkBody('email', 'Must be a valid email')
      .isEmail({ allow_utf8_local_part: false })
      .isSimpleEmail()
      .isLength({ min: 3, max: 100 })
    req.checkBody('password', 'Must be 6 to 100 characters.').isLength({ min: 6, max: 100 })
    ;(await req.getValidationResult()).throw()
    var { username, email, password } = req.body

    // check email if registration is closed
    if (!this.config.registration.open) {
      if (!this.config.registration.allowed.includes(email)) {
        let error = {
          message: 'Your email has not been whitelisted for registration by the admin.',
          emailNotWhitelisted: true
        }
        return res.status(422).json(error)
      }
    }

    // check if the username is reserved
    var {reservedNames} = this.config.registration
    if (reservedNames && Array.isArray(reservedNames) && reservedNames.length > 0) {
      if (reservedNames.indexOf(username.toLowerCase()) !== -1) {
        let error = {
          message: 'That username is reserved, please choose another.',
          reservedName: true
        }
        return res.status(422).json(error)
      }
    }

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
      let error = false
      if (await this.usersDB.isEmailTaken(email)) {
        error = {
          message: 'Email is not available',
          emailNotAvailable: true
        }
      } else if (await this.usersDB.isUsernameTaken(username)) {
        error = {
          message: 'Username is not available',
          usernameNotAvailable: true
        }
      }

      // render error
      if (error) {
        return res.status(422).json(error)
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
    // log the verification link
    if (this.config.env === 'development') {
      console.log('Verify link for', username)
      console.log(`https://${this.config.hostname}/v1/verify?${qs}`)
    }

    // respond
    res.status(201).end()
  }

  async verify (req, res) {
    var contentType = req.accepts(['html', 'json'])

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

    // generate session token
    var sessionToken = this.sessions.generate(userRecord)
    res.cookie('sess', sessionToken, {
      httpOnly: true,
      secure: (this.config.env !== 'development')
    })

    // respond
    if (contentType === 'html') {
      res.redirect('/?verified=true')
    } else {
      res.status(200).end()
    }
  }

  async getAccount (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()

    // fetch user record
    var userRecord = await this.usersDB.getByID(res.locals.session.id)
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
    if (!res.locals.session) throw new UnauthorizedError()

    // validate & sanitize input
    req.checkBody('profileURL').isDatURL()
    ;(await req.getValidationResult()).throw()
    req.sanitizeBody('profileURL').toDatDomain()
    var { profileURL } = req.body

    // fetch user record
    var userRecord = await this.usersDB.getByID(res.locals.session.id)
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

  async doLogin (req, res) {
    // validate & sanitize input
    req.checkBody('username', 'Invalid username.').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkBody('password', 'Invalid password.').isLength({ min: 6, max: 100 })
    ;(await req.getValidationResult()).throw()
    var { username, password } = req.body

    var userRecord
    try {
      // fetch user record & check credentials
      userRecord = await this.usersDB.getByUsername(username)
      assert(userRecord.isEmailVerified)
      assert(verifyPassword(password, userRecord))
    } catch (e) {
      return res.status(422).json({
        message: 'Invalid username/password',
        invalidCredentials: true
      })
    }

    // check for a suspension
    if (userRecord.suspension) {
      throw new ForbiddenError('Your account has been suspended.')
    }

    // generate session token
    var sessionToken = this.sessions.generate(userRecord)
    res.cookie('sess', sessionToken, {
      httpOnly: true,
      secure: (this.config.env !== 'development')
    })

    // respond
    res.status(200).json({ sessionToken })
  }

  async doLogout (req, res) {
    res.clearCookie('sess', {
      httpOnly: true,
      secure: (this.config.env !== 'development')
    })
    res.redirect('/')
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
      case 'archives':
        res.status(200).json({
          archives: userRecord.archives
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
