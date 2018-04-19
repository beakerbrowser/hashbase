const test = require('ava')
const {createClient} = require('dat-pinning-service-client')
const createTestServer = require('./lib/server.js')

var app

test.cb('start test server', t => {
  app = createTestServer(async err => {
    t.ifError(err)

    t.pass('started')
    t.end()
  })
})

test.cb('login fails on wrong username or password', t => {
  createClient(app.url, (err, client) => {
    if (err) throw err

    // wrong password fails
    client.login('admin', 'wrongpass', err => {
      t.truthy(err)
      t.deepEqual(err.statusCode, 422)

      t.end()
    })
  })
})

test.cb('can get account info', t => {
  createClient(app.url, {username: 'admin', password: 'foobar'}, (err, client) => {
    if (err) throw err
    t.truthy(client.hasSession)

    // can get account info
    client.getAccount((err, res) => {
      if (err) throw err
      t.deepEqual(res.username, 'admin')

      // can list dats
      client.listDats((err, res) => {
        if (err) throw err
        t.deepEqual(res.items, [])

        // logout
        client.logout(err => {
          if (err) throw err
          t.falsy(client.hasSession)

          t.end()
        })
      })
    })
  })
})

test.cb('add & remove dats', t => {
  createClient(app.url, {username: 'admin', password: 'foobar'}, (err, client) => {
    if (err) throw err
    t.truthy(client.hasSession)

    // add dat
    client.addDat({
      url: 'dat://868d6000f330f6967f06b3ee2a03811efc23591afe0d344cc7f8c5fb3b4ac91f',
      name: 'mysite'
    }, (err) => {
      if (err) throw err

      // get dat (verify)
      client.getDat('868d6000f330f6967f06b3ee2a03811efc23591afe0d344cc7f8c5fb3b4ac91f', (err, res) => {
        if (err) throw err
        t.deepEqual(res, {
          url: 'dat://868d6000f330f6967f06b3ee2a03811efc23591afe0d344cc7f8c5fb3b4ac91f',
          name: 'mysite',
          title: '',
          description: '',
          additionalUrls: [
            'dat://mysite-admin.test.local',
            'https://mysite-admin.test.local'
          ]
        })

        // update dat
        client.updateDat('868d6000f330f6967f06b3ee2a03811efc23591afe0d344cc7f8c5fb3b4ac91f', {
          name: 'my-site'
        }, (err) => {
          if (err) throw err

          // get dat (verify)
          client.getDat('868d6000f330f6967f06b3ee2a03811efc23591afe0d344cc7f8c5fb3b4ac91f', (err, res) => {
            if (err) throw err
            t.deepEqual(res, {
              url: 'dat://868d6000f330f6967f06b3ee2a03811efc23591afe0d344cc7f8c5fb3b4ac91f',
              name: 'my-site',
              title: '',
              description: '',
              additionalUrls: [
                'dat://my-site-admin.test.local',
                'https://my-site-admin.test.local'
              ]
            })

            // list dats
            client.listDats((err, res) => {
              if (err) throw err
              t.deepEqual(res.items, [
                {
                  url: 'dat://868d6000f330f6967f06b3ee2a03811efc23591afe0d344cc7f8c5fb3b4ac91f',
                  name: 'my-site',
                  title: '',
                  description: '',
                  additionalUrls: [
                    'dat://my-site-admin.test.local',
                    'https://my-site-admin.test.local'
                  ]
                }
              ])

              // remove dat
              client.removeDat('868d6000f330f6967f06b3ee2a03811efc23591afe0d344cc7f8c5fb3b4ac91f', err => {
                if (err) throw err

                // list dats
                client.listDats((err, res) => {
                  if (err) throw err
                  t.deepEqual(res.items, [])

                  t.end()
                })
              })
            })
          })
        })
      })
    })
  })
})

test.cb('stop test server', t => {
  app.close(() => {
    t.pass('closed')
    t.end()
  })
})
