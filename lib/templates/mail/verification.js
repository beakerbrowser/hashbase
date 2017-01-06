exports.subject = function () {
  return 'Verify your email address'
}

exports.text = function (params) {
  return `
    \n
    Welcome, ${params.username}, to ${params.hostname}.\n
    \n
    To verify your account, follow this link:\n
    \n
    ${params.emailVerificationLink}\n
    \n
    Or paste this code into the signup screen:\n
    \n
    ${params.emailVerificationNonce}\n
    \n
  `
}

exports.html = function (params) {
  return `
    <h1>Welcome, ${params.username}, to ${params.hostname}.</h1>
    <p>To verify your account, follow this link:</p>
    <p><a href="${params.emailVerificationLink}" title="Verify account">${params.emailVerificationLink}</a></p>
    <p>Or paste this code into the signup screen:</p>
    <p><code>${params.emailVerificationNonce}</code></p>
  `
}
