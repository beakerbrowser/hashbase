exports.subject = function () {
  return 'Forgotten password reset'
}

exports.text = function (params) {
  return `
    \n
    **Forgotten password reset for ${params.username}.**\n
    \n
    We received a request at ${params.hostname} to reset your password.\n
    \n
    If this was you, follow this link:\n
    \n
    ${params.forgotPasswordLink}\n
    \n
    If you did not request to reset your password, please ignore this email.\n
    \n
    \n
  `
}

exports.html = function (params) {
  return `
    <h1>Forgotten password reset for ${params.username}.</h1>
    <p>We received a request at ${params.hostname} to reset your password. If this was you, follow this link:</p>
    <h3><a href="${params.forgotPasswordLink}" title="Reset password">${params.forgotPasswordLink}</a></h3>
    <p>If you did not request to reset your password, please ignore this email.</p>
  `
}
