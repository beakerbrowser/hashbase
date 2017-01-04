var nodemailer = require('nodemailer')
var templates = {
  verification: require('./templates/mail/verification')
}

// exported api
// =

module.exports = class Mailer {
  constructor(config) {
    this.hostname = config.hostname
    this.sender = config.email.sender
    this.transport = nodemailer.createTransport(config.email)
  }

  async send(tmpl, params) {
    params = Object.assign({}, params, this)
    tmpl = templates[tmpl]
    try {
      return await this.transport.sendEmail({
        from: this.sender,
        to: params.email,
        subject: tmpl.subject(params),
        text: templ.text(params),
        html: templ.html(params)
      })
    } catch (err) {
      this.logError(err, tmpl, params)
      throw err
    }
  }

  logError(err, tmpl, params) {
    console.error('[ERROR] Failed to send email', tmpl, 'To:', params.email, 'Error:', err)
  }
}