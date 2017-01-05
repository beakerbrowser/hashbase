var test = require('tape')
var createTestServer = require('./lib/server.js')

var app

test('start test server', t => {
  app = createTestServer(err => {
    t.ifErr(err)
    t.end()
  })
})

test('register', t => {
  var json = {
    'email': 'bob@example.com',
    'username': 'bob',
    'password': 'foobar'
  }
  app.req.post({uri: '/v1/register', json}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 201, '201 created user')
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
