var test = require('tape')
var createTestServer = require('./lib/server.js')

var app

// NOTE the test accounts created, when all tests are run sequentially:
// - alice
// - bob
// - carla (invalid, never verifies email)

test('start test server', t => {
  app = createTestServer(err => {
    t.ifErr(err)
    t.end()
  })
})

test('register and POST verify', async t => {
  var res, lastMail

  // register alice
  res = await app.req.post({uri: '/v1/register', json: {
    email: 'alice@example.com',
    username: 'alice',
    password: 'foobar'
  }})
  t.equals(res.statusCode, 201, '201 created user')

  // check sent mail and extract the verification nonce
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.ok(lastMail)
  t.equals(lastMail.data.subject, 'Verify your email address')
  emailVerificationNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // verify via POST
  res = await app.req.post({uri: '/v1/verify', json: {
    username: 'alice',
    nonce: emailVerificationNonce
  }})
  t.equals(res.statusCode, 200, '200 verified user')
    
  // check sent mail
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.ok(lastMail)
  t.equals(lastMail.data.subject, 'Welcome to test.local')

  t.end()
})

test('register and GET verify', async t => {
  var res, lastMail

  // register bob
  res = await app.req.post({uri: '/v1/register', json: {
    email: 'bob@example.com',
    username: 'bob',
    password: 'foobar'
  }})
  t.equals(res.statusCode, 201, '201 created user')

  // check sent mail and extract the verification nonce
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.ok(lastMail)
  t.equals(lastMail.data.subject, 'Verify your email address')
  emailVerificationNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // verify via GET
  res = await app.req.get({uri: '/v1/verify', qs: {
    username: 'bob',
    nonce: emailVerificationNonce
  }})
  t.equals(res.statusCode, 200, '200 verified user')
    
  // check sent mail
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.ok(lastMail)
  t.equals(lastMail.data.subject, 'Welcome to test.local')

  t.end()
})

test('register validation', async t => {
  async function run(inputs, badParam) {
    var res = await app.req.post({uri: '/v1/register', json: inputs})
    t.equals(res.statusCode, 422, '422 bad input')
    t.equals(res.body.invalidInputs, true, 'invalidInputs')
    t.equals(res.body.details[0].param, badParam, 'bad '+badParam)
  }

  await run({ email: 'bob@example.com', username: 'bob' }, 'password') // missing password
  await run({ email: 'bob@example.com', password: 'foobar' }, 'username') // missing username
  await run({ username: 'bob', password: 'foobar' }, 'email') // missing email
  await run({ email: 'bob@example.com', username: 'bob', password: 'a' }, 'password') // password too short
  await run({ email: 'bob@example.com', username: 'a', password: 'foobar' }, 'username') // username too short
  await run({ email: 'bob@example.com', username: 'bob.boy', password: 'foobar' }, 'username') // username has invalid chars
  await run({ email: 'asdf', username: 'bob', password: 'foobar' }, 'email') // invalid email
  t.end()
})

test('verify validation', async t => {
  async function run(type, inputs, badParam) {
    var res = await (type === 'post' 
      ? app.req.post({uri: '/v1/verify', json: inputs})
      : app.req.get({url: '/v1/verify', qs: inputs, json: true}))
    t.equals(res.statusCode, 422, '422 bad input')
    t.equals(res.body.invalidInputs, true, 'invalidInputs')
    t.equals(res.body.details[0].param, badParam, 'bad '+badParam)
  }

  // register carla
  var res = await app.req.post({uri: '/v1/register', json: {
    email: 'carla@example.com',
    username: 'carla',
    password: 'foobar'
  }})
  t.equals(res.statusCode, 201, '201 created user')

  await run('get', { username: 'carla' }, 'nonce') // missing nonce
  await run('post', { username: 'carla' }, 'nonce') // missing nonce
  await run('get', { nonce: 'asdf' }, 'username') // missing username
  await run('post', { nonce: 'asdf' }, 'username') // missing username
  t.end()
})

test('cant register an already-registered user', async t => {
  var res

  // email collision on fully-registered account
  res = await app.req.post({uri: '/v1/register', json: {
    email: 'alice@example.com',
    username: 'rando',
    password: 'foobar'
  }})
  t.equals(res.statusCode, 422, '422 bad input')
  t.equals(res.body.emailNotAvailable, true, 'emailNotAvailable')

  // username collision on fully-registered account
  res = await app.req.post({uri: '/v1/register', json: {
    email: 'rando@example.com',
    username: 'alice',
    password: 'foobar'
  }})
  t.equals(res.statusCode, 422, '422 bad input')
  t.equals(res.body.usernameNotAvailable, true, 'usernameNotAvailable')

  // email collision on half-registered account
  res = await app.req.post({uri: '/v1/register', json: {
    email: 'carla@example.com',
    username: 'rando',
    password: 'foobar'
  }})
  t.equals(res.statusCode, 422, '422 bad input')
  t.equals(res.body.emailNotAvailable, true, 'emailNotAvailable')

  // username collision on half-registered account
  res = await app.req.post({uri: '/v1/register', json: {
    email: 'rando@example.com',
    username: 'carla',
    password: 'foobar'
  }})
  t.equals(res.statusCode, 422, '422 bad input')
  t.equals(res.body.usernameNotAvailable, true, 'usernameNotAvailable')

  t.end()
})

test('cant verify a username that hasnt been registered', async t => {
  var res = await app.req.get({uri: '/v1/verify', json: true, qs: {
    username: 'rando',
    nonce: 'asdf'
  }})
  t.equals(res.statusCode, 422, '422 bad input')
  t.equals(res.body.invalidUsername, true, 'invalidUsername')
  t.end()
})

test('verify fails with incorrect nonce', async t => {
  var res = await app.req.get({uri: '/v1/verify', json: true, qs: {
    username: 'carla',
    nonce: 'asdf'
  }})
  t.equals(res.statusCode, 422, '422 bad input')
  t.equals(res.body.invalidNonce, true, 'invalidNonce')
  t.end()
})

test('login', async t => {
  var res = await app.req.post({uri: '/v1/login', json: {
    'username': 'bob',
    'password': 'foobar'
  }})
  t.equals(res.statusCode, 200, '200 got token')
  t.ok(res.body.sessionToken, 'got token in response')
  t.end()
})

test('login validation', async t => {
  async function run(inputs, badParam) {
    var res = await app.req.post({uri: '/v1/login', json: inputs})
    t.equals(res.statusCode, 422, '422 bad input')
    t.equals(res.body.invalidInputs, true, 'invalidInputs')
    t.equals(res.body.details[0].param, badParam, 'bad '+badParam)
  }

  await run({ username: 'bob' }, 'password') // missing password
  await run({ password: 'foobar' }, 'username') // missing username
  t.end()
})

test('cant login with invalid credentials', async t => {
  var res

  res = await app.req.post({uri: '/v1/login', json: {
    'username': 'rando',
    'password': 'foobar'
  }})
  t.equals(res.statusCode, 422, '422 bad input')
  t.ok(res.body.invalidCredentials, 'invalidCredentials')

  res = await app.req.post({uri: '/v1/login', json: {
    'username': 'bob',
    'password': 'asdf'
  }})
  t.equals(res.statusCode, 422, '422 bad input')
  t.ok(res.body.invalidCredentials, 'invalidCredentials')

  t.end()  
})

test('stop test server', t => {
  app.close(() => {
    t.ok(true, 'closed')
    t.end()
  })
})
