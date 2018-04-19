var path = require('path')
var test = require('ava')
var createTestServer = require('./lib/server.js')
var { makeDatFromFolder } = require('./lib/dat.js')

var app
var sessionToken, auth
var testDatKey

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

test('add archive', async t => {
  var json = {key: testDatKey, name: 'my-dat'}
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

test('add archive to featured', async t => {
  var res = await app.req.post({uri: `/v2/admin/archives/${testDatKey}/feature`, auth})
  t.is(res.statusCode, 200, '200 added dat to featured')
})

test('get populated featured', async t => {
  var res = await app.req.get({uri: '/v2/explore?view=featured', json: true})
  t.is(res.statusCode, 200, '200 got featured dats')
  t.is(res.body.featured.length, 1, 'got 1 archive')
  for (var i = 0; i < 1; i++) {
    let archive = res.body.featured[i]
    t.truthy(typeof archive.key === 'string', 'has key')
    t.truthy(typeof archive.numPeers === 'number', 'has numPeers')
    t.truthy(typeof archive.name === 'string', 'has name')
    t.truthy(typeof archive.title === 'string', 'has title')
    t.truthy(typeof archive.description === 'string', 'has description')
    t.truthy(typeof archive.owner === 'string', 'has owner')
    t.truthy(typeof archive.createdAt === 'number', 'has createdAt')
  }
})

test('remove archive from featured', async t => {
  var res = await app.req.post({uri: `/v2/admin/archives/${testDatKey}/unfeature`, auth})
  t.is(res.statusCode, 200, '200 removed dat from featured')
})

test('get unpopulated featured', async t => {
  var res = await app.req.get({uri: '/v2/explore?view=featured', json: true})
  t.is(res.statusCode, 200, '200 got featured dats')
  t.is(res.body.featured.length, 0, 'got 0 archives')
})

test.cb('stop test server', t => {
  app.close(() => {
    t.pass('closed')
    t.end()
  })
})
