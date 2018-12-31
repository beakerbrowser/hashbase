var test = require('ava')
var createTestServer = require('./lib/server.js')

var app

// NOTE the test accounts created, when all tests are run sequentially:
// - alice
// - bob
// - carla (invalid, never verifies email)

test.cb('start test server', t => {
  createTestServer((err, _app) => {
    t.ifError(err)
    app = _app
    t.end()
  })
})

test('register and POST verify', async t => {
  var res, lastMail

  // register alice
  res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: 'alice@example.com',
      username: 'alice',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  t.is(res.statusCode, 201, '201 created user')
  t.truthy(res.body.id)
  t.is(res.body.email, 'alice@example.com')

  // check sent mail and extract the verification nonce
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.truthy(lastMail)
  t.is(lastMail.data.subject, 'Verify your email address')
  var emailVerificationNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // verify via POST
  res = await app.req.post({
    uri: '/v2/accounts/verify',
    json: {
      username: 'alice',
      nonce: emailVerificationNonce
    }
  })
  t.is(res.statusCode, 200, '200 verified user')
})

test('register and GET verify', async t => {
  var res, lastMail

  // register bob
  res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: 'bob@example.com',
      username: 'bob',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  t.is(res.statusCode, 201, '201 created user')

  // check sent mail and extract the verification nonce
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.truthy(lastMail)
  t.is(lastMail.data.subject, 'Verify your email address')
  var emailVerificationNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // verify via GET
  res = await app.req.get({
    uri: '/v2/accounts/verify',
    qs: {
      username: 'bob',
      nonce: emailVerificationNonce
    },
    json: true
  })
  t.is(res.statusCode, 200, '200 verified user')
})

test('register validation', async t => {
  // async function expectPass (inputs) {
  //   var res = await app.req.post({uri: '/v2/accounts/register', json: inputs})
  //   t.is(res.statusCode, 201, '201 good input')
  // }
  async function expectFail (inputs, badParam) {
    var res = await app.req.post({uri: '/v2/accounts/register', json: inputs})
    t.is(res.statusCode, 422, '422 bad input')
    t.is(res.body.invalidInputs, true, 'invalidInputs')
  }

  await expectFail({ email: 'bob@example.com', username: 'bob' }, 'password') // missing password
  await expectFail({ email: 'bob@example.com', password: 'foobar', passwordConfirm: 'foobar' }, 'username') // missing username
  await expectFail({ username: 'bob', password: 'foobar', passwordConfirm: 'foobar' }, 'email') // missing email
  await expectFail({ email: 'bob@example.com', username: 'bob', password: 'a', passwordConfirm: 'a' }, 'password') // password too short
  await expectFail({ email: 'bob@example.com', username: 'a', password: 'foobar', passwordConfirm: 'foobar' }, 'username') // username too short
  await expectFail({ email: 'bob@example.com', username: 'bob.boy', password: 'foobar', passwordConfirm: 'foobar' }, 'username') // username has invalid chars
  await expectFail({ email: 'asdf', username: 'bob', password: 'foobar', passwordConfirm: 'foobar' }, 'email') // invalid email
  await expectFail({ email: 'bob+foo@example.com', username: 'bobobobo', password: 'foobar', passwordConfirm: 'foobar' }) // invalid email
  // await expectFail({ email: 'bob@example.com', username: 'bob', password: 'foobar', passwordConfirm: 'foobaz' }, 'passwordConfirm') // invalid passwordConfirm TODO
})

test('register usernames are case insensitive', async t => {
  var res, lastMail

  // register alice
  res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: 'alice-insensitive@example.com',
      username: 'AlIcENoCaSe',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  t.is(res.statusCode, 201, '201 created user')
  t.truthy(res.body.id)
  t.is(res.body.email, 'alice-insensitive@example.com')

  // check sent mail and extract the verification nonce
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.truthy(lastMail)
  t.is(lastMail.data.subject, 'Verify your email address')
  var emailVerificationNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // verify via POST
  res = await app.req.post({
    uri: '/v2/accounts/verify',
    json: {
      username: 'alICEnocase',
      nonce: emailVerificationNonce
    }
  })
  t.is(res.statusCode, 200, '200 verified user')
})

test('register blocks reserved usernames', async t => {
  async function run (inputs) {
    var res = await app.req.post({uri: '/v2/accounts/register', json: inputs})
    t.is(res.statusCode, 422, '422 bad input')
    t.is(res.body.reservedName, true, 'reservedName')
  }

  await run({ email: 'bob@example.com', username: 'blacklisted', password: 'foobar', passwordConfirm: 'foobar' })
  await run({ email: 'bob@example.com', username: 'reserved', password: 'foobar', passwordConfirm: 'foobar' })
  await run({ email: 'bob@example.com', username: 'RESERVED', password: 'foobar', passwordConfirm: 'foobar' })
})

test('verify validation', async t => {
  async function run (type, inputs, badParam) {
    var res = await (type === 'post'
      ? app.req.post({uri: '/v2/accounts/verify', json: inputs})
      : app.req.get({url: '/v2/accounts/verify', qs: inputs, json: true}))
    t.is(res.statusCode, 422, '422 bad input')
    t.is(res.body.invalidInputs, true, 'invalidInputs')
  }

  // register carla
  var res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: 'carla@example.com',
      username: 'carla',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  t.is(res.statusCode, 201, '201 created user')

  await run('get', { username: 'carla' }, 'nonce') // missing nonce
  await run('post', { username: 'carla' }, 'nonce') // missing nonce
  await run('get', { nonce: 'asdf' }, 'username') // missing username
  await run('post', { nonce: 'asdf' }, 'username') // missing username
})

test('cant register an already-registered user', async t => {
  var res

  // email collision on fully-registered account
  res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: 'alice@example.com',
      username: 'rando',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  t.is(res.statusCode, 422, '422 bad input')
  t.is(res.body.emailNotAvailable, true, 'emailNotAvailable')

  // username collision on fully-registered account
  res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: 'rando@example.com',
      username: 'alice',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  t.is(res.statusCode, 422, '422 bad input')
  t.is(res.body.usernameNotAvailable, true, 'usernameNotAvailable')

  // email collision on half-registered account
  res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: 'carla@example.com',
      username: 'rando',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  t.is(res.statusCode, 422, '422 bad input')
  t.is(res.body.emailNotAvailable, true, 'emailNotAvailable')

  // username collision on half-registered account
  res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: 'rando@example.com',
      username: 'carla',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  t.is(res.statusCode, 422, '422 bad input')
  t.is(res.body.usernameNotAvailable, true, 'usernameNotAvailable')
})

test('cant verify a username that hasnt been registered', async t => {
  var res = await app.req.get({
    uri: '/v2/accounts/verify',
    json: true,
    qs: {
      username: 'rando',
      nonce: 'asdf'
    }
  })
  t.is(res.statusCode, 422, '422 bad input')
  t.is(res.body.invalidUsername, true, 'invalidUsername')
})

test('verify fails with incorrect nonce', async t => {
  var res = await app.req.get({
    uri: '/v2/accounts/verify',
    json: true,
    qs: {
      username: 'carla',
      nonce: 'asdf'
    }
  })
  t.is(res.statusCode, 422, '422 bad input')
  t.is(res.body.invalidNonce, true, 'invalidNonce')
})

test('login', async t => {
  var res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 200, '200 got token')
  t.truthy(res.body.sessionToken, 'got token in response')
})

test('login is case insensitive', async t => {
  var res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'BOB',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 200, '200 got token')
  t.truthy(res.body.sessionToken, 'got token in response')
})

test('login configured admin user', async t => {
  var res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'admin',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 200, '200 got token')
  t.truthy(res.body.sessionToken, 'got token in response')
})

test('login validation', async t => {
  async function run (inputs, badParam) {
    var res = await app.req.post({uri: '/v2/accounts/login', json: inputs})
    t.is(res.statusCode, 422, '422 bad input')
    t.is(res.body.invalidInputs, true, 'invalidInputs')
  }

  await run({ username: 'bob' }, 'password') // missing password
  await run({ password: 'foobar' }, 'username') // missing username
})

test('cant login with invalid credentials', async t => {
  var res

  res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'rando',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 422, '422 bad input')
  t.truthy(res.body.invalidCredentials, 'invalidCredentials')

  res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'asdfasdf'
    }
  })
  t.is(res.statusCode, 422, '422 bad input')
  t.truthy(res.body.invalidCredentials, 'invalidCredentials')
})

test('login and get profile', async t => {
  // login
  var res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 200, '200 got token')

  // get profile
  var auth = {bearer: res.body.sessionToken}
  res = await app.req.get({url: '/v2/accounts/account', auth, json: true})
  t.is(res.statusCode, 200, '200 got profile')
  t.is(res.body.email, 'bob@example.com', 'email is included')
  t.is(res.body.username, 'bob', 'username is included')
})

test('login and change email', async t => {
  var res, lastMail

  // login
  res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'foobar'
    }
  })

  t.is(res.statusCode, 200, '200 got token')
  t.truthy(res.body.sessionToken, 'got token in response')

  var auth = {bearer: res.body.sessionToken}

  // try to change email to a duplicate email address
  res = await app.req.post({
    url: '/v2/accounts/account/email',
    auth,
    json: {
      newEmail: 'bob@example.com',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 422)

  // try to change email with invalid password
  res = await app.req.post({
    url: '/v2/accounts/account/email',
    auth,
    json: {
      newEmail: 'bob@example.com',
      password: 'barfoo'
    }
  })
  t.is(res.statusCode, 422)

  // change the email address
  res = await app.req.post({
    url: '/v2/accounts/account/email',
    auth,
    json: {
      newEmail: 'bob2@example.com',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 200)

  // verify that the user's email address does not change until it's verified
  res = await app.req.get({url: '/v2/accounts/account', auth, json: true})
  t.is(res.body.email, 'bob@example.com')

  // check sent mail and extract the verification nonce
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.truthy(lastMail)
  t.is(lastMail.data.subject, 'Verify your email address')
  var emailVerificationNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // verify via POST
  res = await app.req.post({
    uri: '/v2/accounts/verify',
    json: {
      username: 'bob',
      nonce: emailVerificationNonce
    }
  })
  t.is(res.statusCode, 200, '200 verified user')

  // verify that the user's email was updated
  res = await app.req.get({url: '/v2/accounts/account', auth, json: true})
  t.is(res.body.email, 'bob2@example.com')
})

test('login and change password', async t => {
  // login
  var res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 200, '200 got token')
  t.truthy(res.body.sessionToken, 'got token in response')

  // change password
  var auth = {bearer: res.body.sessionToken}
  res = await app.req.post({
    url: '/v2/accounts/account/password',
    auth,
    json: {
      oldPassword: 'foobar',
      newPassword: 'foobaz'
    }
  })
  t.is(res.statusCode, 200, '200 password changed')

  // login with new password
  res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'foobaz'
    }
  })
  t.is(res.statusCode, 200, '200 got token')
  t.truthy(res.body.sessionToken, 'got token in response')
})

test('forgot password flow', async t => {
  var res, lastMail

  // start the flow
  res = await app.req.post({
    uri: '/v2/accounts/forgot-password',
    json: {
      email: 'bob2@example.com'
    }
  })
  t.is(res.statusCode, 200, '200 started forgot password flow')

  // check sent mail and extract the verification nonce
  var sentMail = app.cloud.mailer.transport.sentMail
  await waitUntil(() => sentMail[sentMail.length - 1].data.subject === 'Forgotten password reset')
  lastMail = sentMail.pop()
  t.truthy(lastMail)
  t.is(lastMail.data.subject, 'Forgotten password reset')
  var forgotPasswordNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // update password
  res = await app.req.post({
    uri: '/v2/accounts/account/password',
    json: {
      username: 'bob',
      nonce: forgotPasswordNonce,
      newPassword: 'fooblah'
    }
  })
  t.is(res.statusCode, 200, '200 updated password')

  // login with new password
  res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'fooblah'
    }
  })
  t.is(res.statusCode, 200, '200 got token')
  t.truthy(res.body.sessionToken, 'got token in response')
})

test('forgot password flow rejects bad nonces', async t => {
  var res

  // update password
  res = await app.req.post({
    uri: '/v2/accounts/account/password',
    json: {
      username: 'bob',
      nonce: 'bs',
      newPassword: 'fooblah'
    }
  })
  t.is(res.statusCode, 422, '422 bad nonce')
})

test.cb('stop test server', t => {
  app.close(() => {
    t.pass('closed')
    t.end()
  })
})

function waitUntil (pred) {
  return new Promise(resolve => {
    var i = setInterval(() => {
      if (pred()) {
        clearInterval(i)
        resolve()
      }
    }, 50)
  })
}
