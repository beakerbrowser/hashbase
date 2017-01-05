var test = require('tape')
var createTestServer = require('./lib/server.js')

var app
var emailVerificationNonce

test('start test server', t => {
  app = createTestServer(err => {
    t.ifErr(err)
    t.end()
  })
})

test('register and POST verify', async t => {
  var res, lastMail

  // register account
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

  // register account
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

test('login', async t => {
  var res = await app.req.post({uri: '/v1/login', json: {
    'username': 'bob',
    'password': 'foobar'
  }})
  t.equals(res.statusCode, 200, '200 got token')
  t.ok(res.body.sessionToken, 'got token in response')
  t.end()
})

test('stop test server', t => {
  app.close(() => {
    t.ok(true, 'closed')
    t.end()
  })
})
