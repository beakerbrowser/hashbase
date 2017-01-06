exports.DAT_KEY_REGEX = /([0-9a-f]{64})/i
exports.DAT_URL_REGEX = /^(dat:\/\/[0-9a-f]{64})/i

exports.UnauthorizedError = class UnauthorizedError extends Error {
  constructor (message) {
    super(message)
    this.name = 'UnauthorizedError'
    this.status = 401
    this.body = {
      message: message || 'You must sign in to access this resource',
      notAuthorized: true
    }
  }
}

exports.ForbiddenError = class ForbiddenError extends Error {
  constructor (message) {
    super(message)
    this.name = 'ForbiddenError'
    this.status = 403
    this.body = {
      message: message || 'You dont have the rights to access this resource',
      forbidden: true
    }
  }
}
