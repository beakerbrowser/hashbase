exports.subject = function (params) {
  return `Welcome to ${params.hostname}`
}

exports.text = function (params) {
  return `
    \n
    Welcome, ${params.username}, to ${params.hostname}.\n
    \n
    Your account is now verified.\n
    \n
  `
}

exports.html = function (params) {
  return `
    <h1>Welcome, ${params.username}, to ${params.hostname}.</h1>
    <p>Your account is now verified</p>
  `
}