exports.DAT_KEY_REGEX = /([0-9a-f]{64})/i
exports.DAT_URL_REGEX = /^(dat:\/\/[0-9a-f]{64})/i
exports.DAT_NAME_REGEX = /^([0-9a-zA-Z-.]*)$/i

exports.NotFoundError = class NotFoundError extends Error {
  constructor (message) {
    super(message)
    this.name = 'NotFoundError'
    this.status = 404
    this.body = {
      message: message || 'Resource not found',
      notFound: true
    }
  }

}

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

exports.NotImplementedError = class NotImplementedError extends Error {
  constructor (message) {
    super(message)
    this.name = 'NotImplementedError'
    this.status = 501
    this.body = {
      message: message || 'Resources not yet implemented',
      notImplemented: true
    }
  }
}
