var test = require('tape')
var createTestServer = require('./lib/test-server.js')

var app
var token

test('start test server', function (t) {
  app = createTestServer(err => {
    t.ifErr(err)
    t.end()
  })
})

test('register', function (t) {
  var json = {
    'email': 'foo@example.com',
    'password': 'foobar'
  }
  app.req.post({uri: '/v1/register', json}, function (err, resp, body) {
    t.ifErr(err)
    t.equals(resp.statusCode, 201, '201 created user')
    t.ok(body.token, 'got token in response')
    t.end()
  })
})

test('login', function (t) {
  var json = {
    'email': 'foo@example.com',
    'password': 'foobar'
  }
  app.req.post({uri: '/v1/login', json}, function (err, resp, body) {
    t.ifErr(err)
    t.equals(resp.statusCode, 200, '200 got token')
    t.ok(body.token, 'got token in response')
    token = body.token
    t.end()
  })
})

// TODO! -prf
// test('change pw', function (t) {
//   var json = {
//     'email': 'foo@example.com',
//     'password': 'foobar',
//     'newPassword': 'tacobar'
//   }
//   var headers = {authorization: 'Bearer ' + token}
//   app.req.post({uri: '/updatepassword', json, headers}, function (err, resp, body) {
//     t.ifErr(err)
//     t.equals(resp.statusCode, 200, '200 got token')
//     t.ok(body.token, 'got token in response')
//     t.notEqual(token, body.token, 'new token is diff from old token')
//     token = body.token
//     t.end()
//   })
// })

// TODO! -prf
// test('login with new pw', function (t) {
//   var json = {
//     'email': 'foo@example.com',
//     'password': 'tacobar'
//   }
//   app.req.post({uri: '/login', json}, function (err, resp, body) {
//     t.ifErr(err)
//     t.equals(resp.statusCode, 200, '200 got token')
//     t.ok(body.token, 'got token in response')
//     t.notEqual(token, body.token, 'login token is diff from token from after changing pw')
//     token = body.token
//     t.end()
//   })
// })

test('stop test server', function (t) {
  app.close(() => {
    t.ok(true, 'closed')
    t.end()
  })
})
