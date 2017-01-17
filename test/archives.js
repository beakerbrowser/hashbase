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
    }
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
  var res = await app.req.post({uri: '/v1/dats/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/admin?view=dats', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.dats[0], {
    key: testDatKey,
    name: null
  })

  res = await app.req.get({url: '/admin/' + testDatKey, json: true, auth})
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
  var res = await app.req.post({uri: '/v1/dats/add', json, auth: authUser})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/bob?view=dats', json: true, auth: authUser})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.dats[0], {
    key: testDatKey,
    name: null
  })

  res = await app.req.get({url: '/bob/' + testDatKey, json: true, auth: authUser})
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
  var res = await app.req.post({uri: '/v1/dats/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/admin?view=dats', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.dats[0], {
    key: testDatKey,
    name: null
  })

  res = await app.req.get({url: '/admin/' + testDatKey, json: true, auth})
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
  var res = await app.req.post({uri: '/v1/dats/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/admin?view=dats', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.dats[0], {
    key: testDatKey,
    name: 'test-archive'
  })

  res = await app.req.get({url: '/admin/test-archive', json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by name')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test-archive',
    title: null,
    description: null
  })

  res = await app.req.get({url: '/admin/' + testDatKey, json: true, auth})
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
  res = await app.req.post({uri: '/v1/dats/add', json, auth})
  t.is(res.statusCode, 422, '422 invalid name')

  // change name the second time
  json = {key: testDatKey, name: 'test.dat'}
  res = await app.req.post({uri: '/v1/dats/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/admin?view=dats', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.dats[0], {
    key: testDatKey,
    name: 'test.dat'
  })

  res = await app.req.get({url: '/admin/test.dat', json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by name')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test.dat',
    title: null,
    description: null
  })

  res = await app.req.get({url: '/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by key')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test.dat',
    title: null,
    description: null
  })

  res = await app.req.get({url: '/admin/test-archive', json: true, auth})
  t.is(res.statusCode, 404, '404 old name not found')
})

test.cb('check archive status and wait till synced', t => {
  var to = setTimeout(() => {
    throw new Error('Archive did not sync')
  }, 15e3)

  checkStatus()
  async function checkStatus () {
    var res = await app.req({uri: `/${testDatKey}`, qs: {view: 'status'}, json: true, auth})
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

test('remove archive', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/dats/remove', json, auth})
  t.is(res.statusCode, 200, '200 removed dat')
})

test('check archive status after removed by one user, not all', async t => {
  var res = await app.req({uri: `/${testDatKey}`, qs: {view: 'status'}, auth})
  t.is(res.statusCode, 200, '200 got dat')
})

test('remove archive as other user', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/dats/remove', json, auth: authUser})
  t.is(res.statusCode, 200, '200 removed dat')
})

test('remove archive that was already removed', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v1/dats/remove', json, auth})
  t.is(res.statusCode, 200, '200 removed dat')
})

test('check archive status after removed', async t => {
  var res = await app.req({uri: `/${testDatKey}`, qs: {view: 'status'}, auth})
  t.is(res.statusCode, 404, '404 not found')

  res = await app.req.get({url: '/admin?view=dats', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.is(res.body.dats.length, 0)

  res = await app.req.get({url: '/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 404, '404 not found')

  res = await app.req.get({url: '/admin/testdat', json: true, auth})
  t.is(res.statusCode, 404, '404 not found')
})

// test('archive status will timeout on archive that fails to sync', async t => {
//   // add a fake archive
//   var fakeKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
//   var json = {key: fakeKey}
//   var res = await app.req({uri: '/v1/dats/add', method: 'POST', json, auth})
//   t.same(res.statusCode, 200, '200 status')

//   // now ask for the status. since the archive is never found, this should timeout
//   console.log('waiting for timeout, this should take 5 seconds...')
//   res = await app.req({uri: `/${fakeKey}`, qs: {view: 'status'}})
//   t.same(res.statusCode, 504, '504 status')
// })

test.cb('stop test server', t => {
  app.close(() => {
    testDat.close(() => {
      t.pass('closed')
      t.end()
    })
  })
})
