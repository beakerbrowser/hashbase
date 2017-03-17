var test = require('ava')
var createTestServer = require('./lib/server.js')

var app
var sessionToken, auth, authUser
var fakeDatKey1 = 'a'.repeat(64)
var fakeDatKey2 = 'b'.repeat(64)

test.cb('start test server', t => {
  app = createTestServer(async err => {
    t.ifError(err)

    // login
    var res = await app.req.post({
      uri: '/v1/login',
      json: {
        'username': 'admin',
        'password': 'foobar'
      }
    })
    if (res.statusCode !== 200) throw new Error('Failed to login as admin')
    sessionToken = res.body.sessionToken
    auth = { bearer: sessionToken }

    t.end()
  })
})

test('register and login bob', async t => {
  // register bob
  var res = await app.req.post({
    uri: '/v1/register',
    json: {
      email: 'bob@example.com',
      username: 'bob',
      password: 'foobar'
    }
  })
  if (res.statusCode !== 201) throw new Error('Failed to register bob user')

  // check sent mail and extract the verification nonce
  var lastMail = app.cloud.mailer.transport.sentMail.pop()
  var emailVerificationNonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // verify via GET
  res = await app.req.get({
    uri: '/v1/verify',
    qs: {
      username: 'bob',
      nonce: emailVerificationNonce
    },
    json: true
  })
  if (res.statusCode !== 200) throw new Error('Failed to verify bob user')

  // login bob
  res = await app.req.post({
    uri: '/v1/login',
    json: {
      'username': 'bob',
      'password': 'foobar'
    }
  })
  if (res.statusCode !== 200) throw new Error('Failed to login as bob')
  sessionToken = res.body.sessionToken
  authUser = { bearer: sessionToken }
})

test('do some activity', async t => {
  var res
  var json

  // add an archive as admin
  json = {key: fakeDatKey1}
  res = await app.req.post({uri: '/v1/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  // add an archive as bob
  json = {key: fakeDatKey2}
  res = await app.req.post({uri: '/v1/archives/add', json, auth: authUser})
  t.is(res.statusCode, 200, '200 added dat')

  // remove an archive as admin
  json = {key: fakeDatKey1}
  res = await app.req.post({uri: '/v1/archives/remove', json, auth})
  t.is(res.statusCode, 200, '200 removed dat')
})

test('get activity', async t => {
  // no offset
  var res = await app.req.get({url: '/v1/explore?view=activity', json: true})
  t.is(res.statusCode, 200, '200 got activity')
  t.is(res.body.activity.length, 3)
  t.is(res.body.activity[0].username, 'admin')
  t.is(res.body.activity[0].action, 'del-archive')
  t.is(res.body.activity[0].params.key, fakeDatKey1)
  t.is(res.body.activity[1].username, 'bob')
  t.is(res.body.activity[1].action, 'add-archive')
  t.is(res.body.activity[1].params.key, fakeDatKey2)
  t.is(res.body.activity[2].username, 'admin')
  t.is(res.body.activity[2].action, 'add-archive')
  t.is(res.body.activity[2].params.key, fakeDatKey1)

  // with offset
  var start = res.body.activity[0].key
  res = await app.req.get({url: '/v1/explore', qs: {view: 'activity', start}, json: true})
  t.is(res.statusCode, 200, '200 got activity')
  t.is(res.body.activity.length, 2)
  t.is(res.body.activity[0].username, 'bob')
  t.is(res.body.activity[0].action, 'add-archive')
  t.is(res.body.activity[0].params.key, fakeDatKey2)
  t.is(res.body.activity[1].username, 'admin')
  t.is(res.body.activity[1].action, 'add-archive')
  t.is(res.body.activity[1].params.key, fakeDatKey1)
})

test.cb('stop test server', t => {
  app.close(() => {
    t.pass('closed')
    t.end()
  })
})
