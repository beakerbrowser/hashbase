exports.subject = function () {
  return 'Verify your email address'
}

exports.text = function (params) {
  return `
    \n
    Hi ${params.username},\n
    \n
    You requested to change the email address assocatied with your account at ${params.brandname}.
    \n
    To verify this change, follow this link:\n
    \n
    ${params.emailVerificationLink}\n
    \n
    \n
  `
}

exports.html = function (params) {
  return `
    <h1>Hi, ${params.username}.</h1>
    <p>You requested to change the email address associated with your account at ${params.brandname}.</p>
    <p>To verify this change, follow this link:</p>
    <h3><a href="${params.emailVerificationLink}" title="Verify email change">${params.emailVerificationLink}</a></h3>
  `
}
