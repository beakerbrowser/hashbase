var { promisify } = require('es6-promisify')
var { createHash, randomBytes } = require('crypto')

// promisify some methods
randomBytes = promisify(randomBytes)

// exported api
// =

exports.randomBytes = randomBytes

exports.shasum = shasum
function shasum (buf) {
  if (typeof buf !== 'string' && !Buffer.isBuffer(buf)) {
    buf = JSON.stringify(buf)
  }
  return createHash('sha256')
    .update(buf, Buffer.isBuffer(buf) ? null : 'utf8')
    .digest('hex')
}

exports.hashPassword = async function (password) {
  // generate a new salt and hash the password with it
  var passwordSalt = await randomBytes(16)
  password = Buffer.from(password, 'utf8')
  return {
    passwordHash: shasum(Buffer.concat([passwordSalt, password])),
    passwordSalt: passwordSalt.toString('hex')
  }
}

exports.verifyPassword = function (password, userRecord) {
  // verify that the given password, when hashed, is the same as the password on record
  var passwordHash = shasum(Buffer.concat([
    Buffer.from(userRecord.passwordSalt, 'hex'),
    Buffer.from(password, 'utf8')
  ]))
  return (passwordHash === userRecord.passwordHash)
}
