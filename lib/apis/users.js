const assert = require('assert')
const querystring = require('querystring')
const Stripe = require('stripe')
const bytes = require('bytes')
const {randomBytes, hashPassword, verifyPassword} = require('../crypto')
const {UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError} = require('../const')
const lock = require('../lock')

// exported api
// =

module.exports = class UsersAPI {
  constructor (cloud) {
    assert(typeof cloud.config.stripe.secretKey === 'string')
    this.config = cloud.config
    this.archiver = cloud.archiver
    this.usersDB = cloud.usersDB
    this.activityDB = cloud.activityDB
    this.sessions = cloud.sessions
    this.proofs = cloud.proofs
    this.mailer = cloud.mailer
    this.stripe = Stripe(cloud.config.stripe.secretKey)
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
    req.checkBody('passwordConfirm', 'Must be 6 to 100 characters').isLength({ min: 6, max: 100 })
    ;(await req.getValidationResult()).throw()
    var { username, email, password, passwordConfirm } = req.body

    // check that the passwords match
    if (password !== passwordConfirm) {
      return res.status(422).json({
        message: 'Passwords don\'t match.'
      })
    }

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

    // generate email verification nonce
    let emailVerificationNonce = (await randomBytes(32)).toString('hex')

    // salt and hash password
    let {passwordHash, passwordSalt} = await hashPassword(password)

    var release = await lock('users')
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
      var record = await this.usersDB.create({
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
    req.logAnalytics('register')
    res.status(201).json({id: record.id, email: record.email})
  }

  async verify (req, res) {
    var contentType = req.accepts(['html', 'json'])

    // validate & sanitize input
    req.check('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.check('nonce').isLength({ min: 3, max: 100 })
    ;(await req.getValidationResult()).throw()
    var username = req.query.username || req.body.username
    var nonce = req.query.nonce || req.body.nonce

    var release = await lock('users')
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

      // handle account email changes
      if (userRecord.pendingEmail) {
        userRecord.email = userRecord.pendingEmail
        userRecord.pendingEmail = null
      }
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
      domain: this.config.hostname,
      httpOnly: true,
      secure: (this.config.env !== 'development'),
      sameSite: 'Lax'
    })

    // respond
    req.logAnalytics('confirm-email')
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
      // profileURL: userRecord.profileURL, TODO
      // profileVerifyToken: userRecord.profileVerifyToken, TODO
      diskUsage: userRecord.diskUsage,
      diskQuota: this.config.getUserDiskQuota(userRecord),
      updatedAt: userRecord.updatedAt,
      createdAt: userRecord.createdAt
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

    var release = await lock('users')
    try {
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
    } finally {
      release()
    }

    // respond
    res.status(200).end()
  }

  async updateAccountPassword (req, res) {
    var userRecord
    var session = res.locals.session

    var release = await lock('users')
    try {
      // handle inputs based on whether this is an in-session update, or a forgot-password flow
      if (session) {
        // validate inputs
        req.checkBody('oldPassword', 'Must be 6 to 100 characters.').isLength({ min: 6, max: 100 })
        req.checkBody('newPassword', 'Must be 6 to 100 characters.').isLength({ min: 6, max: 100 })
        ;(await req.getValidationResult()).throw()
        let { oldPassword } = req.body

        // verify old password
        try {
          userRecord = await this.usersDB.getByID(session.id)
          assert(userRecord.isEmailVerified)
          assert(verifyPassword(oldPassword, userRecord))
        } catch (e) {
          return res.status(422).json({
            message: 'Invalid password',
            invalidCredentials: true
          })
        }
      } else {
        // validate inputs
        req.checkBody('username').isAlphanumeric().isLength({ min: 3, max: 16 })
        req.checkBody('nonce').isLength({ min: 3, max: 100 })
        req.checkBody('newPassword', 'Must be 6 to 100 characters.').isLength({ min: 6, max: 100 })
        ;(await req.getValidationResult()).throw()
        let { username, nonce } = req.body

        // fetch user record
        userRecord = await this.usersDB.getByUsername(username)
        if (!userRecord) {
          return res.status(422).json({
            message: 'Invalid username',
            invalidUsername: true
          })
        }

        // compare email nonce
        if (nonce !== userRecord.forgotPasswordNonce) {
          return res.status(422).json({
            message: 'Invalid verification code',
            invalidNonce: true
          })
        }
      }

      // salt and hash the new password
      let {passwordHash, passwordSalt} = await hashPassword(req.body.newPassword)

      // update user record
      Object.assign(userRecord, {
        passwordHash,
        passwordSalt,
        forgotPasswordNonce: null
      })
      await this.usersDB.put(userRecord)
    } finally {
      release()
    }

    // respond
    res.status(200).end()
  }

  async updateAccountEmail (req, res) {
    var userRecord
    var session = res.locals.session

    // verify inputs
    req.checkBody('newEmail', 'Must be a valid email')
      .isEmail({ allow_utf8_local_part: false })
      .isSimpleEmail()
      .isLength({ min: 3, max: 100 })
    req.checkBody('password', 'Invalid password.').isLength({ min: 6, max: 100 })
    ;(await req.getValidationResult()).throw()
    let { newEmail, password } = req.body

    // generate email verification nonce
    let emailVerificationNonce = (await randomBytes(32)).toString('hex')

    var release = await lock('users')
    try {
      // fetch user record
      userRecord = await this.usersDB.getByID(session.id)
      if (!userRecord) {
        return res.status(500).json({
          message: 'Session user record not found',
          userRecordNotFound: true
        })
      }

      // verify password
      try {
        assert(verifyPassword(password, userRecord))
      } catch (e) {
        return res.status(422).json({
          message: 'Invalid password',
          invalidCredentials: true
        })
      }

      // check email availability
      let error = false
      if (await this.usersDB.isEmailTaken(newEmail)) {
        error = {
          message: 'Email is not available',
          emailNotAvailable: true
        }
      }

      // render error
      if (error) {
        return res.status(422).json(error)
      }

      // update user record
      userRecord.pendingEmail = newEmail
      userRecord.emailVerificationNonce = emailVerificationNonce
      await this.usersDB.put(userRecord)
    } finally {
      release()
    }

    // send email
    var qs = querystring.stringify({
      username: userRecord.username,
      nonce: emailVerificationNonce
    })

    this.mailer.send('verify-update-email', {
      email: newEmail,
      username: userRecord.username,
      emailVerificationNonce,
      emailVerificationLink: `https://${this.config.hostname}/v1/verify?${qs}`
    })
    // log the verification link
    if (this.config.env === 'development') {
      console.log('Verify link for', userRecord.username)
      console.log(`https://${this.config.hostname}/v1/verify?${qs}`)
    }

    // respond
    res.status(200).end()
  }

  async upgradePlan (req, res) {
    var {sessionUser} = res.locals
    var {token} = req.body

    // sanity checks
    if (!sessionUser) throw new NotFoundError()
    if (sessionUser.stripeSubscriptionId) {
      // TODO log this event?
      throw new BadRequestError('You already have a plan active! Please contact support.')
    }

    // update plan
    await this._createProPlan(token, sessionUser)
    req.logAnalytics('upgrade')

    // respond
    res.status(200).end()
  }

  async registerPro (req, res) {
    var {token} = req.body

    var id = req.query.id || req.body.id
    if (!id) {
      throw new BadRequestError('ID is required')
    }

    // fetch user record
    var userRecord = await this.usersDB.getByID(id)
    if (!userRecord) {
      return res.status(422).json({
        message: 'Invalid user ID'
      })
    }

    // update plan
    await this._createProPlan(token, userRecord)
    req.logAnalytics('upgrade')

    // respond
    res.status(200).end()
  }

  async updateCard (req, res) {
    var {sessionUser} = res.locals
    var {token} = req.body

    // sanity checks
    if (!sessionUser) throw new NotFoundError()

    // validate token
    try {
      this._validateStripeToken(token)
    } catch (e) {
      return res.status(422).json({
        message: 'Invalid payment token'
      })
    }

    // lock
    var release = await lock('users:plan-change:' + sessionUser.id)
    try {
      var customerId = sessionUser.stripeCustomerId

      try {
        // add the new card
        await this.stripe.customers.createSource(customerId, {source: token.id})

        // set the new card as customer's default card
        await this.stripe.customers.update(customerId, {default_source: token.card.id})
      } catch (e) {
        throw new BadRequestError('Failed to update your payment information. Try again or contact support.')
      }

      // update local records
      this.usersDB.update(sessionUser.id, {
        stripeCustomerId: customerId,
        stripeTokenId: token.id,
        stripeCardId: token.card.id,
        stripeCardBrand: token.card.brand,
        stripeCardCountry: token.card.country,
        stripeCardCVCCheck: token.card.cvc_check,
        stripeCardExpMonth: token.card.exp_month,
        stripeCardExpYear: token.card.exp_year,
        stripeCardLast4: token.card.last4
      })

      // respond
      res.status(200).end()
    } finally {
      release()
    }
  }

  async cancelPlan (req, res) {
    var {session, sessionUser} = res.locals

    // sanity checks
    if (!sessionUser) throw new NotFoundError()
    // does the user have an account and subscription?
    if (!sessionUser.stripeCustomerId || !sessionUser.stripeSubscriptionId) {
      throw new BadRequestError('You\'re not currently on a plan.')
    }

    var release = await lock('users:plan-change:' + sessionUser.id)
    try {
      try {
        // cancel with stripe
        await this.stripe.subscriptions.del(sessionUser.stripeSubscriptionId)
      } catch (err) {
        throw new BadRequestError('Failed to stop your account with Stripe. Try again or contact support.')
      }

      // update local records
      await this.usersDB.update(session.id, {
        plan: 'basic',
        diskQuota: null,
        stripeSubscriptionId: null,
        stripeTokenId: null,
        stripeCardId: null,
        stripeCardBrand: null,
        stripeCardCountry: null,
        stripeCardCVCCheck: null,
        stripeCardExpMonth: null,
        stripeCardExpYear: null,
        stripeCardLast4: null
      })

      // respond
      req.logAnalytics('cancel-plan')
      res.status(200).end()
    } finally {
      release()
    }
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
      domain: this.config.hostname,
      httpOnly: true,
      secure: (this.config.env !== 'development'),
      sameSite: 'Lax'
    })

    // respond
    req.logAnalytics('login')
    res.status(200).json({ sessionToken })
  }

  async doLogout (req, res) {
    res.clearCookie('sess', {
      domain: this.config.hostname,
      httpOnly: true,
      secure: (this.config.env !== 'development'),
      sameSite: 'Lax'
    })
    req.logAnalytics('logout')
    res.redirect('/')
  }

  async doForgotPassword (req, res) {
    // validate & sanitize input
    req.checkBody('email', 'Must be a valid email').isEmail().isLength({ min: 3, max: 100 })
    ;(await req.getValidationResult()).throw()
    var {email} = req.body

    // generate the nonce
    let forgotPasswordNonce = (await randomBytes(32)).toString('hex')

    var release = await lock('users')
    try {
      // fetch user record
      var userRecord = await this.usersDB.getByEmail(email)

      // send a response immediately so user list can't be enumerated
      res.status(200).end()

      if (!userRecord) {
        return
      }

      // save the email verification nonce
      Object.assign(userRecord, {forgotPasswordNonce})
      await this.usersDB.put(userRecord)
    } finally {
      release()
    }

    // send email
    var qs = querystring.stringify({
      username: userRecord.username,
      nonce: forgotPasswordNonce
    })
    this.mailer.send('forgot-password', {
      email,
      username: userRecord.username,
      forgotPasswordNonce,
      forgotPasswordLink: `https://${this.config.hostname}/reset-password?${qs}`
    })

    // log the verification link
    if (this.config.env === 'development') {
      console.log('Forgot-password link for', userRecord.username)
      console.log(`https://${this.config.hostname}/reset-password?${qs}`)
    }
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
        await Promise.all(userRecord.archives.map(async (archive) => {
          var manifest = await this.archiver.getManifest(archive.key)
          if (manifest) {
            archive.title = manifest.title
            archive.description = manifest.description
          } else {
            archive.title = ''
            archive.description = ''
          }
        }))
        res.status(200).json({
          archives: userRecord.archives
        })
        break

      case 'activity':
        res.status(200).json({
          activity: await this.activityDB.listUserEvents(username, {
            limit: 25,
            lt: req.query.start,
            reverse: true
          })
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

  async dismissBeakerPrompt (req, res) {
    // validate session
    if (!res.locals.session) throw new UnauthorizedError()

    var release = await lock('users')
    try {
      // fetch user record
      var userRecord = await this.usersDB.getByID(res.locals.session.id)
      if (!userRecord) {
        return res.status(500).json({
          message: 'Session user record not found',
          userRecordNotFound: true
        })
      }

      userRecord.hasDismissedBeakerPrompt = true

      // update user record
      await this.usersDB.put(userRecord)
    } finally {
      release()
    }

    // respond
    res.status(200).end()
  }

  _validateStripeToken (token) {
    assert(token && typeof token === 'object')
    assert(typeof token.id === 'string')
    assert(token.card && typeof token.card === 'object')
    assert(typeof token.card.id === 'string')
    assert(token.card.address_zip)
    assert(typeof token.card.brand === 'string')
    assert(typeof token.card.country === 'string')
    assert(typeof token.card.cvc_check === 'string')
    assert(typeof token.card.exp_month === 'string')
    assert(typeof token.card.exp_year === 'string')
    assert(typeof token.card.last4 === 'string')
  }

  // handle upgrade to pro
  async _createProPlan (token, userRecord) {
    var release = await lock('users:plan-change:' + userRecord.id)
    try {
      // validate token
      try {
        this._validateStripeToken(token)
      } catch (e) {
        let err = new Error()
        err.status = 422
        err.message = 'Invalid payment token'
        throw err
      }

      var customerId
      try {
        // create the stripe customer
        if (userRecord.stripeCustomerId) {
          customerId = userRecord.stripeCustomerId
        } else {
          let customer = await this.stripe.customers.create({
            email: userRecord.email,
            description: userRecord.username,
            source: token.id
          })
          customerId = customer.id
        }

        // start them on the plan
        var subscription = await this.stripe.subscriptions.create({
          customer: customerId,
          plan: 'pro',
          tax_percent: this.config.stripe.salesTaxPct
        })
      } catch (err) {
        console.error('Failed to setup pro plain!', err)
        throw new BadRequestError('Failed to create an account with Stripe. Try again or contact support.')
      }

      // update local records
      this.usersDB.update(userRecord.id, {
        plan: 'pro',
        diskQuota: bytes.parse(this.config.proDiskUsageLimit),
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeTokenId: token.id,
        stripeCardId: token.card.id,
        stripeCardBrand: token.card.brand,
        stripeCardCountry: token.card.country,
        stripeCardCVCCheck: token.card.cvc_check,
        stripeCardExpMonth: token.card.exp_month,
        stripeCardExpYear: token.card.exp_year,
        stripeCardLast4: token.card.last4
      })
    } finally {
      release()
    }
  }
}
