var lock = require('../lock')()
var pify = require('pify')
var { randomBytes, hashPassword, verifyPassword } = require('../crypto')

// exported api
// =

module.exports = class UsersAPI {
  constructor (usersDB, sessions) {
    this.usersDB = usersDB
    this.sessions
  }

  async register (req, res) {
    // validate & sanitize input
    req.checkBody({
      username: UsersDB.schemas.username,
      email: UsersDB.schemas.email,
      password: UsersDB.schemas.password
    })
    req.checkBody('username').notEmpty()
    req.checkBody('email').notEmpty()
    req.checkBody('password').notEmpty()
    (await req.getValidationResult()).throw()
    var { username, email, password } = req.body

    // allocate email verification nonce
    let emailVerificationNonce = await randomBytes(32)

    // salt and hash password
    let { passwordHash, passwordSalt } = await hashPassword(password)

    var release = await lock(username)
    try {
      // check email & username availability
      if (await this.usersDB.isEmailTaken(email)) {
        return res.code(422).json({ 
          message: 'Email is not available',
          emailNotAvailable: true
        })
      }
      if (await this.usersDB.isUsernameTaken(username)) {
        return res.code(422).json({
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
    // TODO

    // respond
    res.code(201).json(/* TODO body */)
  }

  async verify (req, res) {
    // validate & sanitize input
    req.checkBody({
      email: UsersDB.schemas.email,
      nonce: { isString: true }
    })
    req.checkBody('email').notEmpty()
    req.checkBody('nonce').notEmpty()
    (await req.getValidationResult()).throw()
    var { email, nonce } = req.body

    var release = await lock(username)
    try {
      // fetch user record
      var userRecord = await this.usersDB.getByEmail(email)
      if (!userRecord) {
        return res.code(422).json({
          message: 'Invalid email',
          invalidEmail: true
        })        
      }

      // compare email nonce
      if (nonce !== userRecord.emailVerificationNonce) {
        return res.code(422).json({
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

    // respond
    res.code(200).json(/* TODO body */)
  }

  async getAccount (req, res) {
    // validate session
    if (!req.session) {
      return res.code(401).json({
        message: 'You must sign in to access this resource',
        notAuthorized: true
      })
    }

    // fetch user record
    var userRecord = await this.usersDB.getByID(req.session.id)
    if (!userRecord) {
      return res.code(500).json({
        message: 'Session user record not found',
        userRecordNotFound: true
      })
    }

    // respond
    res.code(200).json({ 
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
      return res.code(401).json({
        message: 'You must sign in to access this resource',
        notAuthorized: true
      })
    }

    // validate & sanitize input
    req.checkBody({
      profileURL: UsersDB.schemas.profileURL
    })
    (await req.getValidationResult()).throw()
    req.sanitizeBody('profileURL').toDatDomain()
    var { profileURL } = req.body

    var release = await lock(username)
    try {
      // fetch user record
      var userRecord = await this.usersDB.getByID(req.session.id)
      if (!userRecord) {
        return res.code(500).json({
          message: 'Session user record not found',
          userRecordNotFound: true
        })
      }

      // new profile dat?
      if (profileURL && profileURL !== userRecord.profileURL) {
        // generate a new proof
        // TODO

        // remove old profile-dat from swarm
        // TODO

        // add new profile-dat to swarm
        // TODO

        // update record
        userRecord.profileURL = profileURL
      }

      // update user record
      await this.usersDB.put(userRecord)
    } finally {
      release()
    }

    // respond
    res.code(200).end()
  }

  async login (req, res) {
    // validate & sanitize input
    req.checkBody({
      username: UsersDB.schemas.username,
      password: UsersDB.schemas.password
    })
    req.checkBody('username').notEmpty()
    req.checkBody('password').notEmpty()
    (await req.getValidationResult()).throw()
    var { username, password } = req.body

    try {
      // fetch user record & check credentials
      var userRecord = await this.usersDB.getByUsername(username)
      assert(verifyPassword(password, userRecord))
    } catch (e) {
      return res.code(422).json({
        message: 'Invalid username/password',
        invalidCredentials: true
      })
    }

    // generate session token
    var sessionToken = this.sessions.generate(userRecord)

    // respond
    res.code(200).json({ sessionToken })
  }

  async logout (req, res) {
    // TODO remove? -prf
  }
}