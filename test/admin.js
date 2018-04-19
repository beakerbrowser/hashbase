var test = require('ava')
var bytes = require('bytes')
var path = require('path')
var createTestServer = require('./lib/server.js')
var { makeDatFromFolder } = require('./lib/dat.js')

var app
var sessionToken, auth, testDatKey

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

test.cb('share test-dat', t => {
  makeDatFromFolder(path.join(__dirname, '/scaffold/testdat1'), (err, d, dkey) => {
    t.ifError(err)
    testDatKey = dkey
    t.end()
  })
})

async function registerUser (username) {
  // register
  var res = await app.req.post({
    uri: '/v2/accounts/register',
    json: {
      email: `${username}@example.com`,
      username: username,
      password: 'foobar',
      passwordConfirm: 'foobar'
    }
  })
  if (res.statusCode !== 201) throw new Error(`Failed to register ${username} user`)

  // check sent mail and extract the verification nonce
  var lastMail = app.cloud.mailer.transport.sentMail.pop()
  var nonce = /([0-9a-f]{64})/.exec(lastMail.data.text)[0]

  // verify via GET
  res = await app.req.get({
    uri: '/v2/accounts/verify',
    qs: {username, nonce},
    json: true
  })
  if (res.statusCode !== 200) throw new Error(`Failed to verify ${username} user`)
}

test('register alice, bob, and carla', async t => {
  await registerUser('alice')
  await registerUser('carla')
  await registerUser('bob')
})

test('list users', async t => {
  var res

  // no params
  res = await app.req.get({
    uri: '/v2/admin/users',
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 4, 'no params')
  t.is(res.body.users[0].username, 'admin')
  t.is(res.body.users[1].username, 'alice')
  t.is(res.body.users[2].username, 'carla')
  t.is(res.body.users[3].username, 'bob')

  // reverse sort
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {reverse: 1},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 4, 'reverse sort')
  t.is(res.body.users[0].username, 'bob')
  t.is(res.body.users[1].username, 'carla')
  t.is(res.body.users[2].username, 'alice')
  t.is(res.body.users[3].username, 'admin')

  // with limit
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {limit: 1},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 1, 'with limit')
  t.is(res.body.users[0].username, 'admin')

  // with limit and offset
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {limit: 1, cursor: res.body.users[0].id},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 1, 'with limit and offset')
  t.is(res.body.users[0].username, 'alice')

  // reverse with limit
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {limit: 1, reverse: 1},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 1, 'reverse with limit')
  t.is(res.body.users[0].username, 'bob')

  // reverse with limit and offset
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {limit: 1, reverse: 1, cursor: res.body.users[0].id},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 1, 'reverse with limit and offset')
  t.is(res.body.users[0].username, 'carla')

  // by username
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {sort: 'username'},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  // console.log(res.body.users)
  t.is(res.body.users.length, 4, 'by username')
  t.is(res.body.users[0].username, 'admin')
  t.is(res.body.users[1].username, 'alice')
  t.is(res.body.users[2].username, 'bob')
  t.is(res.body.users[3].username, 'carla')

  // by username reverse sort
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {sort: 'username', reverse: 1},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 4, 'by username reverse sort')
  t.is(res.body.users[0].username, 'carla')
  t.is(res.body.users[1].username, 'bob')
  t.is(res.body.users[2].username, 'alice')
  t.is(res.body.users[3].username, 'admin')

  // by username with limit
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {sort: 'username', limit: 1},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 1, 'by username with limit')
  t.is(res.body.users[0].username, 'admin', 'by username with limit')

  // by username with offset
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {sort: 'username', cursor: 'admin'},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 3, 'by username with offset')
  t.is(res.body.users[0].username, 'alice', 'by username with offset')
  t.is(res.body.users[1].username, 'bob', 'by username with offset')
  t.is(res.body.users[2].username, 'carla', 'by username with offset')

  // by username with limit and offset
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {sort: 'username', limit: 1, cursor: 'admin'},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 1, 'by username with limit and offset')
  t.is(res.body.users[0].username, 'alice', 'by username with limit and offset')

  // by username reverse with limit
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {sort: 'username', limit: 1, reverse: 1},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 1, 'by username reverse with limit')
  t.is(res.body.users[0].username, 'carla')

  // by username reverse with limit and offset
  res = await app.req.get({
    uri: '/v2/admin/users',
    qs: {sort: 'username', limit: 1, reverse: 1, cursor: res.body.users[0].username},
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 1, 'by username reverse with limit and offset')
  t.is(res.body.users[0].username, 'bob')
})

test('get user', async t => {
  var res

  // fetch listing
  res = await app.req.get({
    uri: '/v2/admin/users',
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.users.length, 4)
  var testUser = res.body.users[1]

  // by id
  res = await app.req.get({
    uri: `/v2/admin/users/${testUser.id}`,
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.username, testUser.username)

  // by username
  res = await app.req.get({
    uri: `/v2/admin/users/${testUser.username}`,
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.username, testUser.username)

  // by email
  res = await app.req.get({
    uri: `/v2/admin/users/${testUser.email}`,
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got users')
  t.is(res.body.username, testUser.username)
})

test('fully update carla', async t => {
  var res = await app.req.post({
    uri: '/v2/admin/users/carla',
    json: {
      username: 'carlita',
      email: 'carlita@example.com',
      scopes: ['user', 'admin:users'],
      diskQuota: '5mb'
    },
    auth
  })
  t.is(res.statusCode, 200, '200 updated')

  res = await app.req.get({
    uri: '/v2/admin/users/carlita',
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got')
  t.is(res.body.username, 'carlita', 'is updated')
  t.is(res.body.email, 'carlita@example.com', 'is updated')
  t.deepEqual(res.body.scopes, ['user', 'admin:users'], 'is updated')
  t.deepEqual(res.body.diskQuota, bytes('5mb'), 'is updated')
})

test('partially update carlita', async t => {
  var res = await app.req.post({
    uri: '/v2/admin/users/carlita',
    json: {
      scopes: ['user']
    },
    auth
  })
  t.is(res.statusCode, 200, '200 updated')

  res = await app.req.get({
    uri: '/v2/admin/users/carlita',
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 got')
  t.is(res.body.username, 'carlita', 'is updated')
  t.is(res.body.email, 'carlita@example.com', 'is updated')
  t.deepEqual(res.body.scopes, ['user'], 'is updated')
  t.deepEqual(res.body.diskQuota, bytes('5mb'), 'is updated')
})

test('suspend bob', async t => {
  var res = await app.req.post({
    uri: '/v2/admin/users/bob/suspend',
    json: {reason: 'A total jerk'},
    auth
  })
  t.is(res.statusCode, 200, '200 suspended')
})

test('bob cant login when suspended', async t => {
  var res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 403, '403 cant login when suspended')
})

test('unsuspend bob', async t => {
  var res = await app.req.post({
    uri: '/v2/admin/users/bob/unsuspend',
    json: true,
    auth
  })
  t.is(res.statusCode, 200, '200 suspended')
})

test('bob can login when unsuspended', async t => {
  var res = await app.req.post({
    uri: '/v2/accounts/login',
    json: {
      username: 'bob',
      password: 'foobar'
    }
  })
  t.is(res.statusCode, 200, '200 can login when unsuspended')
})

test('send support email', async t => {
  var res, lastMail

  res = await app.req.post({
    uri: '/v2/admin/users/alice/send-email',
    json: {
      username: 'alice',
      subject: 'The subject line',
      message: 'The message'
    },
    auth
  })
  t.is(res.statusCode, 200)

  // check sent mail and extract the verification nonce
  lastMail = app.cloud.mailer.transport.sentMail.pop()
  t.truthy(lastMail)
  t.is(lastMail.data.subject, 'The subject line')
  t.truthy(lastMail.data.text.includes('The message'))
})

test('remove an archive', async t => {
  var res

  // upload the test archive
  res = await app.req.post({
    uri: '/v2/archives/add',
    json: {key: testDatKey},
    auth
  })

  t.is(res.statusCode, 200, '200 added dat')

  // remove the archive
  res = await app.req.post({
    uri: `/v2/admin/archives/${testDatKey}/remove`,
    json: {
      key: testDatKey
    },
    auth
  })
  t.is(res.statusCode, 200, '200 removed dat')

  // check that the archive was removed
  res = await app.req({uri: `/v2/archives/item/${testDatKey}`, qs: {view: 'status'}, auth})
  t.is(res.statusCode, 404, '404 not found')
})

test('create a report', async t => {
  // create the report
  var res = await app.req.post({
    uri: '/v2/reports/add/',
    json: {
      archiveKey: testDatKey,
      archiveOwner: 'admin',
      reason: 'inappropriate'
    },
    auth
  })
  t.is(res.statusCode, 200)
})

test('update a report', async t => {
  // get the ID of the first report
  var res = await app.req.get({
    uri: '/v2/admin/reports/',
    json: true,
    auth
  })
  var report = res.body.reports[0]

  // update a field that shouldn't be edited
  res = await app.req.post({
    uri: `/v2/admin/reports/${report.id}`,
    json: {
      id: '123',
      auth
    }
  })
  t.is(res.statusCode, 401)

  // update a property that admins can edit
  res = await app.req.post({
    uri: `/v2/admin/reports/${report.id}`,
    json: {
      notes: 'This is a note'
    },
    auth
  })
  t.is(res.statusCode, 200)

  // check if the report was updated
  res = await app.req.get({
    uri: `/v2/admin/reports/${report.id}`,
    json: true,
    auth
  })

  t.is(res.statusCode, 200)
  t.is(res.body.notes, 'This is a note')
})

test.cb('stop test server', t => {
  app.close(() => {
    t.pass('closed')
    t.end()
  })
})
