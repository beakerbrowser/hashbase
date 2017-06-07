var assert = require('assert')
var nodemailer = require('nodemailer')
var templates = {
  verification: require('./templates/mail/verification'),
  'forgot-password': require('./templates/mail/forgot-password'),
  'verify-update-email': require('./templates/mail/verify-update-email'),
  'support': require('./templates/mail/support')
}

// exported api
// =

module.exports = class Mailer {
  constructor (config) {
    this.hostname = config.hostname
    this.brandname = config.brandname
    this.sender = config.email.sender
    this._mailer = nodemailer.createTransport(config.email)
  }

  async send (tmpl, params) {
    assert(params.email)
    params = Object.assign({}, params, this)
    tmpl = templates[tmpl]
    try {
      return await this._mailer.sendMail({
        from: this.sender,
        to: params.email,
        subject: tmpl.subject(params),
        text: tmpl.text(params),
        html: tmpl.html(params)
      })
    } catch (err) {
      this.logError(err, tmpl, params)
      throw err
    }
  }

  get transport () {
    return this._mailer.transporter
  }

  logError (err, tmpl, params) {
    console.error('[ERROR] Failed to send email', tmpl, 'To:', params.email, 'Error:', err)
  }
}
