var test = require('ava')
var path = require('path')
var fs = require('fs')
var promisify = require('es6-promisify')
var createTestServer = require('./lib/server.js')
var { makeDatFromFolder, downloadDatFromSwarm } = require('./lib/dat.js')

var app
var sessionToken, auth, authUser
var testDat, testDatKey
var fsstat = promisify(fs.stat, fs)

test.cb('start test server', t => {
  app = createTestServer(async err => {
    t.ifError(err)

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

test.cb('share test-dat', t => {
  makeDatFromFolder(path.join(__dirname, '/scaffold/testdat1'), (err, d, dkey) => {
    t.ifError(err)
    testDat = d
    testDatKey = dkey
    t.end()
  })
})

test('user disk usage is zero', async t => {
  var res = await app.req.get({url: '/v2/accounts/account', json: true, auth})
  t.is(res.statusCode, 200, '200 got account data')
  t.deepEqual(res.body.diskUsage, 0, 'disk usage is zero')
})

test('add archive', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v2/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')
})

test.cb('check archive status and wait till synced', t => {
  var to = setTimeout(() => {
    throw new Error('Archive did not sync')
  }, 15e3)

  checkStatus()
  async function checkStatus () {
    var res = await app.req({uri: `/v2/archives/${testDatKey}`, qs: {view: 'status'}, json: true, auth})
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

test('read back archive', async t => {
  var res = await app.req.get({url: '/v2/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: null,
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: null,
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/archives/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body, {
    url: `dat://${testDatKey}`,
    name: null,
    title: 'Test Dat 1',
    description: 'The first test dat',
    additionalUrls: []
  })

  res = await app.req.get({url: '/v2/archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body.items[0], {
    url: `dat://${testDatKey}`,
    name: null,
    title: 'Test Dat 1',
    description: 'The first test dat',
    additionalUrls: []
  })
})

test('user disk usage is now non-zero', async t => {
  // run usage-compute job
  await app.cloud.archiver.computeAllUserDiskUsageAndSwarm()

  // check data
  var res = await app.req.get({url: '/v2/accounts/account', json: true, auth})
  t.is(res.statusCode, 200, '200 got account data')
  t.truthy(res.body.diskUsage > 0, 'disk usage is greater than zero')
})

// TEMPORARY - hypercloud only allows one hosting user per archive
// test('add duplicate archive as another user', async t => {
//   var json = {key: testDatKey}
//   var res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
//   t.is(res.statusCode, 200, '200 added dat')

//   res = await app.req.get({url: '/v2/users/bob?view=archives', json: true, auth: authUser})
//   t.is(res.statusCode, 200, '200 got user data')
//   t.deepEqual(res.body.archives[0], {
//     key: testDatKey,
//     name: null,
//     title: 'Test Dat 1',
//     description: 'The first test dat'
//   })

//   res = await app.req.get({url: '/v2/users/bob/' + testDatKey, json: true, auth: authUser})
//   t.is(res.statusCode, 200, '200 got dat data')
//   t.deepEqual(res.body, {
//     user: 'bob',
//     key: testDatKey,
//     name: null,
//     title: 'Test Dat 1',
//     description: 'The first test dat'
//   })
// })
test('dont allow duplicate archives as another user', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v2/archives/add', json, auth: authUser})
  t.is(res.statusCode, 422, '422 rejected')
})

test('add archive that was already added', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v2/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/v2/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: null,
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: null,
    title: 'Test Dat 1',
    description: 'The first test dat'
  })
})

test('change archive name', async t => {
  // change name the first time
  var json = {key: testDatKey, name: 'test-archive'}
  var res = await app.req.post({uri: '/v2/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/v2/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: 'test-archive',
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/users/admin/test-archive', json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by name')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test-archive',
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by key')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test-archive',
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/archives/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body, {
    url: `dat://${testDatKey}`,
    name: 'test-archive',
    title: 'Test Dat 1',
    description: 'The first test dat',
    additionalUrls: ['dat://test-archive-admin.test.local', 'https://test-archive-admin.test.local']
  })

  res = await app.req.get({url: '/v2/archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data')
  t.deepEqual(res.body.items[0], {
    url: `dat://${testDatKey}`,
    name: 'test-archive',
    title: 'Test Dat 1',
    description: 'The first test dat',
    additionalUrls: ['dat://test-archive-admin.test.local', 'https://test-archive-admin.test.local']
  })

  // change to invalid names
  json = {key: testDatKey, name: 'invalid$name'}
  res = await app.req.post({uri: '/v2/archives/add', json, auth})
  t.is(res.statusCode, 422, '422 invalid name')

  // change name the second time
  json = {key: testDatKey, name: 'test--dat'}
  res = await app.req.post({uri: '/v2/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  res = await app.req.get({url: '/v2/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.deepEqual(res.body.archives[0], {
    key: testDatKey,
    name: 'test--dat',
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/users/admin/test--dat', json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by name')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test--dat',
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 200, '200 got dat data by key')
  t.deepEqual(res.body, {
    user: 'admin',
    key: testDatKey,
    name: 'test--dat',
    title: 'Test Dat 1',
    description: 'The first test dat'
  })

  res = await app.req.get({url: '/v2/users/admin/test-archive', json: true, auth})
  t.is(res.statusCode, 404, '404 old name not found')
})

test('dont allow two archives with same name for given user', async t => {
  // add archive
  var json = {key: testDatKey, name: 'test-duplicate-archive'}
  var res = await app.req.post({uri: '/v2/archives/add', json, auth})
  t.is(res.statusCode, 200, '200 added dat')

  // add the archive again
  res = await app.req.post({uri: '/v2/archives/add', json, auth})
  t.is(res.statusCode, 422, '422 name already in use')
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

  var res = await app.req.get({uri: '/v2/explore?view=popular', json: true})
  t.is(res.statusCode, 200, '200 got popular')
  t.is(res.body.popular.length, 1, 'got 1 archive')
  for (var i = 0; i < 1; i++) {
    let archive = res.body.popular[i]
    t.truthy(typeof archive.key === 'string', 'has key')
    t.truthy(typeof archive.numPeers === 'number', 'has numPeers')
    t.truthy(typeof archive.name === 'string', 'has name')
    t.truthy(typeof archive.title === 'string', 'has title')
    t.truthy(typeof archive.description === 'string', 'has description')
    t.truthy(typeof archive.owner === 'string', 'has owner')
    t.truthy(typeof archive.createdAt === 'number', 'has createdAt')
  }
})

test('list archives by recency', async t => {
  var res = await app.req.get({uri: '/v2/explore?view=recent', json: true})
  t.is(res.statusCode, 200, '200 got recent')
  t.is(res.body.recent.length, 1, 'got 1 archive')
  for (var i = 0; i < 1; i++) {
    let archive = res.body.recent[i]
    t.truthy(typeof archive.key === 'string', 'has key')
    t.truthy(typeof archive.numPeers === 'number', 'has numPeers')
    t.truthy(typeof archive.name === 'string', 'has name')
    t.truthy(typeof archive.title === 'string', 'has title')
    t.truthy(typeof archive.description === 'string', 'has description')
    t.truthy(typeof archive.owner === 'string', 'has owner')
    t.truthy(typeof archive.createdAt === 'number', 'has createdAt')
  }
})

test('remove archive', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v2/archives/remove', json, auth})
  t.is(res.statusCode, 200, '200 removed dat')
})

// TEMPORARY only 1 owner per archive allowed
// test('check archive status after removed by one user, not all', async t => {
//   var res = await app.req({uri: `/v2/archives/${testDatKey}`, qs: {view: 'status'}, auth})
//   t.is(res.statusCode, 200, '200 got dat')
// })

// test('remove archive as other user', async t => {
//   var json = {key: testDatKey}
//   var res = await app.req.post({uri: '/v2/archives/remove', json, auth: authUser})
//   t.is(res.statusCode, 200, '200 removed dat')
// })

test('remove archive that was already removed', async t => {
  var json = {key: testDatKey}
  var res = await app.req.post({uri: '/v2/archives/remove', json, auth})
  t.is(res.statusCode, 200, '200 removed dat')
})

test('check archive status after removed', async t => {
  var res = await app.req({uri: `/v2/archives/${testDatKey}`, qs: {view: 'status'}, auth})
  t.is(res.statusCode, 404, '404 not found')

  res = await app.req.get({url: '/v2/users/admin?view=archives', json: true, auth})
  t.is(res.statusCode, 200, '200 got user data')
  t.is(res.body.archives.length, 0)

  res = await app.req.get({url: '/v2/users/admin/' + testDatKey, json: true, auth})
  t.is(res.statusCode, 404, '404 not found')

  res = await app.req.get({url: '/v2/users/admin/testdat', json: true, auth})
  t.is(res.statusCode, 404, '404 not found')
})

test('delete dead archives job', async t => {
  // folder exists
  var stat = await fsstat(app.cloud.archiver._getArchiveFilesPath(testDatKey))
  t.truthy(stat)

  // run job
  await app.cloud.archiver.deleteDeadArchives()

  // folder does not exist
  await t.throws(fsstat(app.cloud.archiver._getArchiveFilesPath(testDatKey)))
})

test('archive status wont stall on archive that fails to sync', async t => {
  // add a fake archive
  var fakeKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  var json = {key: fakeKey}
  var res = await app.req({uri: '/v2/archives/add', method: 'POST', json, auth})
  t.same(res.statusCode, 200, '200 status')

  // now ask for the status. since the archive is never found, this should timeout
  res = await app.req({uri: `/v2/archives/${fakeKey}`, qs: {view: 'status'}})
  t.ok(res.statusCode === 200 || res.statusCode === 404, '200 or 404 status')
})

test.cb('stop test server', t => {
  app.close(() => {
    testDat.close(() => {
      t.pass('closed')
      t.end()
    })
  })
})
