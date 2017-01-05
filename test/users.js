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

test('register', t => {
  var json = {
    email: 'bob@example.com',
    username: 'bob',
    password: 'foobar'
  }
  app.req.post({uri: '/v1/register', json}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 201, '201 created user')

    var lastMail = app.cloud.mailer.transport.sentMail.pop()
    t.ok(lastMail)
    t.equals(lastMail.data.subject, 'Verify your email address')
    emailVerificationNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

    t.end()
  })
})

test('verify', t => {
  var json = {
    username: 'bob',
    nonce: emailVerificationNonce
  }
  app.req.post({uri: '/v1/verify', json}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 200, '200 verified user')
    
    var lastMail = app.cloud.mailer.transport.sentMail.pop()
    t.ok(lastMail)
    t.equals(lastMail.data.subject, 'Welcome to test.local')

    t.end()
  })
})

test('login', t => {
  var json = {
    'username': 'bob',
    'password': 'foobar'
  }
  app.req.post({uri: '/v1/login', json}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 200, '200 got token')
    t.ok(body.sessionToken, 'got token in response')
    t.end()
  })
})

test('stop test server', t => {
  app.close(() => {
    t.ok(true, 'closed')
    t.end()
  })
})
