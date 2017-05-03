var test = require('ava')
var path = require('path')
var createTestServer = require('./lib/server.js')
var { makeDatFromFolder, downloadDatFromSwarm } = require('./lib/dat.js')

var app
var sessionToken, auth, authUser
var testDat, testDatKey

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

test.cb('share test-dat', t => {
  makeDatFromFolder(path.join(__dirname, '/scaffold/testdat1'), (err, d, dkey) => {
    t.ifError(err)
    testDat = d
    testDatKey = dkey
    t.end()
  })
})

test('add archive', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/v1/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: null
  })

  res = await app.req.get({url: '/v1/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: null,
    title: null,
    description: null
  })
})

test('add duplicate archive as another user', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/archives/add', json, auth: authUser})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/v1/users/bob?view=archives', json: true, auth: authUser})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: null
  })

  res = await app.req.get({url: '/v1/users/bob/' + testDatKey, json: true, auth: authUser})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body, {
    user: 'bob',
    key: testDatKey,
    name: null,
    title: null,
    description: null
  })
})

test('add archive that was already added', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/v1/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: null
  })

  res = await app.req.get({url: '/v1/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: null,
    title: null,
    description: null
  })
})

test('change archive name', async t => {
  // change name the first time
  var json = {key: testDatKey, name: 'test-archive'}
  var res = await app.req.post({uri: '/v1/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/v1/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: 'test-archive'
  })

  res = await app.req.get({url: '/v1/users/admin/test-archive', json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by name')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test-archive',
    title: null,
    description: null
  })

  res = await app.req.get({url: '/v1/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by key')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test-archive',
    title: null,
    description: null
  })

  // change to invalid names
  json = {key: testDatKey, name: 'invalid$name'}
  res = await app.req.post({uri: '/v1/archives/add', json, auth})
  t.is(res.statusCode, 422, '422 invalid name')

  // change name the second time
  json = {key: testDatKey, name: 'test--dat'}
  res = await app.req.post({uri: '/v1/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/v1/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: 'test--dat'
  })

  res = await app.req.get({url: '/v1/users/admin/test--dat', json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by name')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test--dat',
    title: null,
    description: null
  })

  res = await app.req.get({url: '/v1/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by key')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test--dat',
    title: null,
    description: null
  })

  res = await app.req.get({url: '/v1/users/admin/test-archive', json: true, auth})
  t.is(res.statusCode, 404, '404 old name not found')
})

test('dont allow two archives with same name for given user', async t => {
  // add archive
  var json = {key: testDatKey, name: 'test-duplicate-archive'}
  var res = await app.req.post({uri: '/v1/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  // add the archive again
  var res = await app.req.post({uri: '/v1/archives/add', json, auth})
  t.is(res.statusCode, 422, '422 name already in use')
})

test.cb('check archive status and wait till synced', t => {
  var to = setTimeout(() => {
    throw new Error('Archive did not sync')
  }, 15e3)

  checkStatus()
  async function checkStatus () {
    var res = await app.req({uri: `/v1/archives/${testDatKey}`, qs: {view: 'status'}, json: true, auth})
    if (!res.body || !('progress' in res.body)) {
      console.log('progress not returned', res.statusCode, res.body)
      return t.end()
    }
    if (res.body.progress === 1) {
      clearTimeout(to)
      console.log('synced!')
      t.end()
    } else {
      console.log('progress', res.body.progress * 100, '%')
      setTimeout(checkStatus, 300)
    }
  }
})

test.cb('archive is accessable via dat swarm', t => {
  console.log('closing origin testdat swarm')
  testDat.close(() => {
    console.log('downloading from server swarm')
    downloadDatFromSwarm(testDatKey, { timeout: 15e3 }, (err, receivedDat) => {
      t.ifError(err)
      t.is(testDat.archive.content.blocks, receivedDat.archive.content.blocks, 'got all content blocks')
      t.end()
    })
  })
})

test('list archives by popularity', async t => {
  // manually compute popular index
  app.cloud.archiver.computePopularIndex()

  var res = await app.req.get({uri: '/v1/explore?view=popular', json: true})
  t.is(res.statusCode, 200, '200 got popular')
  t.is(res.body.popular.length, 1, 'got 1 archive')
  for (var i = 0; i < 1; i++) {
    let archive = res.body.popular[i]
    t.truthy(typeof archive.key === 'string', 'has key')
    t.truthy(typeof archive.numPeers === 'number', 'has numPeers')
    t.truthy(typeof archive.name === 'string', 'has name')
    t.truthy(typeof archive.owner === 'string', 'has owner')
    t.truthy(typeof archive.createdAt === 'number', 'has createdAt')
  }
})

test('list archives by recency', async t => {
  var res = await app.req.get({uri: '/v1/explore?view=recent', json: true})
  t.is(res.statusCode, 200, '200 got recent')
  t.is(res.body.recent.length, 1, 'got 1 archive')
  for (var i = 0; i < 1; i++) {
    let archive = res.body.recent[i]
    t.truthy(typeof archive.key === 'string', 'has key')
    t.truthy(typeof archive.numPeers === 'number', 'has numPeers')
    t.truthy(typeof archive.name === 'string', 'has name')
    t.truthy(typeof archive.owner === 'string', 'has owner')
    t.truthy(typeof archive.createdAt === 'number', 'has createdAt')
  }
})

test('remove archive', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/archives/remove', json, auth})
  t.is(res.statusCode, 200, '200 removed dat')
})

test('check archive status after removed by one user, not all', async t => {
  var res = await app.req({uri: `/v1/archives/${testDatKey}`, qs: {view: 'status'}, auth})
  t.is(res.statusCode, 200, '200 got dat')
})

test('remove archive as other user', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/archives/remove', json, auth: authUser})
  t.is(res.statusCode, 200, '200 removed dat')
})

test('remove archive that was already removed', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/archives/remove', json, auth})
  t.is(res.statusCode, 200, '200 removed dat')
})

test('check archive status after removed', async t => {
  var res = await app.req({uri: `/v1/archives/${testDatKey}`, qs: {view: 'status'}, auth})
  t.is(res.statusCode, 404, '404 not found')

  res = await app.req.get({url: '/v1/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.is(res.body.archives.length, 0)

  res = await app.req.get({url: '/v1/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 404, '404 not found')

  res = await app.req.get({url: '/v1/users/admin/testdat', json: true, auth})
  t.is(res.statusCode, 404, '404 not found')
})

test('archive status wont stall on archive that fails to sync', async t => {
  // add a fake archive
  var fakeKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  var json = {key: fakeKey}
  var res = await app.req({uri: '/v1/archives/add', method: 'POST', json, auth})
  t.same(res.statusCode, 200, '200 status')

  // now ask for the status. since the archive is never found, this should timeout
  res = await app.req({uri: `/v1/archives/${fakeKey}`, qs: {view: 'status'}})
  t.same(res.statusCode, 200, '200 status')
})

test.cb('stop test server', t => {
  app.close(() => {
    testDat.close(() => {
      t.pass('closed')
      t.end()
    })
  })
})
