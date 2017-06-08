exports.subject = function (params) {
  return params.subject
}

exports.text = function (params) {
  return `
    ${params.username},\n
    \n
    ${params.message}\n
    \n
    Thanks,\n
    The ${params.brandname} team
  `
}

exports.html = function (params) {
  return `
    <p>${params.username},</p>
    <p>${params.message}</p>
    <p>Thanks,<br>The ${params.brandname} team</p>
  `
}
