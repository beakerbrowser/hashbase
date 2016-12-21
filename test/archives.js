var test = require('tape')
var createTestServer = require('./lib/test-server.js')
var { makeDatFromFolder, downloadDatFromSwarm } = require('./lib/dat.js')

var app
var testDat
var testDatKey

test('start test server', t => {
  app = createTestServer(err => {
    t.ifErr(err)
    t.end()
  })
})

test('share test-dat', t => {
  makeDatFromFolder(__dirname + '/scaffold/testdat1', (err, d, dkey) => {
    t.ifErr(err)    
    testDat = d
    testDatKey = dkey
    t.end()
  })
})

test('add archive', t => {
  var json = {key: testDatKey}
  app.req.post({uri: '/v1/dat/add', json}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 201, '201 added dat')
    t.equals(body.key, testDatKey, 'got key in response')
    t.end()
  })
})

test('add archive that was already added', t => {
  var json = {key: testDatKey}
  app.req.post({uri: '/v1/dat/add', json}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 201, '201 added dat')
    t.equals(body.key, testDatKey, 'got key in response')
    t.end()
  })
})

test('check archive status', t => {
  app.req({uri: `/${testDatKey}`, qs: {view: 'status'}}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 200, '200 got status')
    // TODO more tests -prf
    t.end()
  })
})

test('archive is accessable via dat swarm', t => {
  downloadDatFromSwarm(testDatKey, { timeout: 5e3 }, (err, receivedDat) => {
    t.ifErr(err)
    t.equals(testDat.archive.content.blocks, receivedDat.archive.content.blocks, 'got all content blocks')
    t.end()
  })
})

test('remove archive', t => {
  var json = {key: testDatKey}
  app.req.post({uri: '/v1/dat/remove', json}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 200, '200 removed dat')
    t.equals(body.key, testDatKey, 'got key in response')
    t.end()
  })
})

test('remove archive that was already removed', t => {
  var json = {key: testDatKey}
  app.req.post({uri: '/v1/dat/remove', json}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 200, '200 removed dat')
    t.equals(body.key, testDatKey, 'got key in response')
    t.end()
  })
})

test('check archive status after removed', t => {
  app.req({uri: `/${testDatKey}`, qs: {view: 'status'}}, (err, res, body) => {
    t.ifErr(err)
    t.equals(res.statusCode, 404, '404 not found')
    t.end()
  })
})

test('stop test server', t => {
  app.close(() => {
    testDat.close(() => {
      t.ok(true, 'closed')
      t.end()
    })
  })
})
