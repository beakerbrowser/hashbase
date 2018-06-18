var test = require('ava')
var path = require('path')
var createTestServer = require('./lib/server.js')
var { makeDatFromFolder } = require('./lib/dat.js')

var app
var sessionToken, auth, authUser
var testDat, testDatKey

test.cb('start test server', t => {
  createTestServer(async (err, _app) => {
    t.ifError(err)
    app = _app

    // login
    var res = await app.req.post({
      uri: '/v2/accounts/login',
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
    uri: '/v2/accounts/register',
    json: {
      email: 'bob@example.com',
      username: 'bob',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  if (res.statusCode !== 201) throw new Error('Failed to register bob user')

  // check sent mail and extract the verification nonce
  var lastMail = app.cloud.mailer.transport.sentMail.pop()
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
  if (res.statusCode !== 200) throw new Error('Failed to verify bob user')

  // login bob
  res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      'username': 'bob',
      'password': 'foobar'
    }
  })
  if (res.statusCode !== 200) throw new Error('Failed to login as bob')
  sessionToken = res.body.sessionToken
  authUser = { bearer: sessionToken }
})

test.cb('share test-dat 1', t => {
  makeDatFromFolder(path.join(__dirname, '/scaffold/testdat1'), (err, d, dkey) => {
    t.ifError(err)
    testDat = d
    testDatKey = dkey
    t.end()
  })
})

test('user disk usage is zero', async t => {
  var res = await app.req.get({url: '/v2/admin/users/bob', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.diskUsage, 0, 'disk usage is zero')
})

test('add archive', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
  t.is(res.statusCode, 200, '200 added dat')
})

test.cb('check archive status and wait till synced', t => {
  var to = setTimeout(() => {
    throw new Error('Archive did not sync')
  }, 15e3)

  checkStatus()
  async function checkStatus () {
    var res = await app.req({uri: `/v2/archives/item/${testDatKey}`, qs: {view: 'status'}, json: true, auth})
    var progress = res.body && res.body.progress ? res.body.progress : 0
    if (progress === 1) {
      clearTimeout(to)
      console.log('synced!')
      t.end()
    } else {
      console.log('progress', progress * 100, '%')
      setTimeout(checkStatus, 300)
    }
  }
})

test('set bobs quota to something really small', async t => {
  var res = await app.req.post({
    uri: '/v2/admin/users/bob',
    json: {diskQuota: '5b'},
    auth
  })
  t.is(res.statusCode, 200, '200 updated')
})

test('user disk usage now exceeds the disk quota', async t => {
  // check user record
  var res = await app.req.get({url: '/v2/admin/users/bob', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.truthy(res.body.diskUsage > res.body.diskQuota, 'disk quota is exceeded')

  // check archive record
  res = await app.req.get({url: `/v2/admin/archives/${testDatKey}`, json: true, auth})
  t.is(res.statusCode, 200, '200 got archive data')
  t.truthy(res.body.diskUsage > 0, 'response has disk usage')
})

test('add archive now fails', async t => {
  var json = {key: 'f'.repeat(64)}
  var res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
  t.is(res.statusCode, 422, '422 denied')
  t.truthy(res.body.outOfSpace, 'disk quota is exceeded')
})

test.cb('stop test server', t => {
  app.close(() => {
    testDat.close(() => {
      t.pass('closed')
      t.end()
    })
  })
})

test.cb('start test server', t => {
  createTestServer(async (err, _app) => {
    t.ifError(err)
    app = _app

    // login
    var res = await app.req.post({
      uri: '/v2/accounts/login',
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
    uri: '/v2/accounts/register',
    json: {
      email: 'bob@example.com',
      username: 'bob',
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  if (res.statusCode !== 201) throw new Error('Failed to register bob user')

  // check sent mail and extract the verification nonce
  var lastMail = app.cloud.mailer.transport.sentMail.pop()
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
  if (res.statusCode !== 200) throw new Error('Failed to verify bob user')

  // login bob
  res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      'username': 'bob',
      'password': 'foobar'
    }
  })
  if (res.statusCode !== 200) throw new Error('Failed to login as bob')
  sessionToken = res.body.sessionToken
  authUser = { bearer: sessionToken }
})

test('enforce name archives limit', async t => {
  var json = {key: '0'.repeat(64), name: 'a'}
  var res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
  t.is(res.statusCode, 200, '200 added dat')

  json = {key: '1'.repeat(64), name: 'b'}
  res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
  t.is(res.statusCode, 200, '200 added dat')

  json = {key: '2'.repeat(64), name: 'c'}
  res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
  t.is(res.statusCode, 200, '200 added dat')

  json = {key: '3'.repeat(64), name: 'd'}
  res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
  t.is(res.statusCode, 422, '422 too many named dats')

  json = {key: '3'.repeat(64)}
  res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
  t.is(res.statusCode, 200, '200 added dat')

  json = {name: 'd'}
  res = await app.req.post({uri: '/v2/archives/item/' + ('3'.repeat(64)), json, auth: authUser})
  t.is(res.statusCode, 422, '422 too many named dats')
})

test.cb('stop test server', t => {
  app.close(() => {
    testDat.close(() => {
      t.pass('closed')
      t.end()
    })
  })
})
