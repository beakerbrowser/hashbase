var test = require('tape')
var path = require('path')
var createTestServer = require('./lib/server.js')
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
  makeDatFromFolder(path.join(__dirname, '/scaffold/testdat1'), (err, d, dkey) => {
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

test('check archive status and wait till synced', t => {
  var to = setTimeout(() => {
    throw new Error('Archive did not sync')
  }, 15e3)

  checkStatus()
  function checkStatus () {
    app.req({uri: `/${testDatKey}`, qs: {view: 'status'}, json: true}, (err, res, body) => {
      t.ifErr(err)
      t.equals(res.statusCode, 200, '200 got status')
      t.ok(body.progress)

      if (body.progress === 1) {
        clearTimeout(to)
        console.log('synced!')
        t.end()
      } else {
        console.log('progress', body.progress * 100, '%')
        setTimeout(checkStatus, 300)
      }
    })
  }
})

test('archive is accessable via dat swarm', t => {
  console.log('closing origin testdat swarm')
  testDat.close(() => {
    console.log('downloading from server swarm')
    downloadDatFromSwarm(testDatKey, { timeout: 15e3 }, (err, receivedDat) => {
      t.ifErr(err)
      t.equals(testDat.archive.content.blocks, receivedDat.archive.content.blocks, 'got all content blocks')
      t.end()
    })
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

test('archive status will timeout on archive that fails to sync', t => {
  // add a fake archive
  var fakeKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  var json = {key: fakeKey}
  app.req({uri: '/v1/dat/add', method: 'POST', json: json}, function (err, resp, body) {
    t.ifErr(err)
    t.same(resp.statusCode, 201, '201 status')
    t.ok(body.key, 'get key back')

    // now ask for the status. since the archive is never found, this should timeout
    console.log('waiting for timeout, this should take 5 seconds...')
    app.req({uri: `/${fakeKey}`, qs: {view: 'status'}}, function (err, resp, body) {
      t.ifErr(err)
      t.same(resp.statusCode, 408, '408 status')
      t.end()
    })
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
