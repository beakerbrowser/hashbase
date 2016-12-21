var test = require('tape')
var createTestServer = require('./lib/test-server.js')
var { shareDat } = require('./lib/dat.js')

var app
var testDat
var testDatKey

test('start test server', function (t) {
  app = createTestServer(err => {
    t.ifErr(err)
    t.end()
  })
})

test('share test-dat', function (t) {
  shareDat(__dirname + '/scaffold/testdat1', (err, d, dkey) => {
    t.ifErr(err)    
    testDat = d
    testDatKey = dkey
    t.end()
  })
})

test('add archive', function (t) {
  var json = {key: testDatKey}
  app.req.post({uri: '/v1/dat/add', json}, function (err, res, body) {
    t.ifErr(err)
    t.equals(res.statusCode, 201, '201 added dat')
    t.equals(body.key, testDatKey, 'got key in response')
    t.end()
  })
})

test('add archive that was already added', function (t) {
  var json = {key: testDatKey}
  app.req.post({uri: '/v1/dat/add', json}, function (err, res, body) {
    t.ifErr(err)
    t.equals(res.statusCode, 201, '201 added dat')
    t.equals(body.key, testDatKey, 'got key in response')
    t.end()
  })
})

test('check archive status', function (t) {
  app.req({uri: `/${testDatKey}`, qs: {view: 'status'}}, function (err, res, body) {
    t.ifErr(err)
    t.equals(res.statusCode, 200, '200 got status')
    // TODO more tests -prf
    t.end()
  })
})

test('remove archive', function (t) {
  var json = {key: testDatKey}
  app.req.post({uri: '/v1/dat/remove', json}, function (err, res, body) {
    t.ifErr(err)
    t.equals(res.statusCode, 200, '200 removed dat')
    t.equals(body.key, testDatKey, 'got key in response')
    t.end()
  })
})

test('remove archive that was already removed', function (t) {
  var json = {key: testDatKey}
  app.req.post({uri: '/v1/dat/remove', json}, function (err, res, body) {
    t.ifErr(err)
    t.equals(res.statusCode, 200, '200 removed dat')
    t.equals(body.key, testDatKey, 'got key in response')
    t.end()
  })
})

test('check archive status after removed', function (t) {
  app.req({uri: `/${testDatKey}`, qs: {view: 'status'}}, function (err, res, body) {
    t.ifErr(err)
    t.equals(res.statusCode, 404, '404 not found')
    t.end()
  })
})

test('stop test server', function (t) {
  app.close(() => {
    testDat.close(() => {
      t.ok(true, 'closed')
      t.end()
    })
  })
})
