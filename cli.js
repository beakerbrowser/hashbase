#!/usr/bin/env node
var path = require('path')
var Hypercloud = require('.')

var args = require('minimist')(process.argv.splice(2))

if (!args._[0]) {
  usage()
  process.exit(1)
}

var cmd = args._[0]
var dir = args.dir || path.join(process.cwd(), 'servers')
var db = args.db || '.hypercloud'
var hypercloud = Hypercloud({dbName: db, dir: dir})

if (cmd === 'start') start(function () { hypercloud.start() })
else if (cmd === 'add') start(addServer)
else if (cmd === 'replicate') {
  start(function () {
    hypercloud.replicate(function (err) {
      if (err) console.error(err)
    })
 })
} else if (cmd === 'backup') backup()

function start (cb) {
  // temp hack to get default "cloud"
  hypercloud.core.list(function (err, keys) {
    if (err) throw err
    var key = keys.length ? keys[0] : null
    if (key) console.log('Cloud Feed Key:', key.toString('hex'))
    hypercloud.create(key)
    cb()
  })
}

function addServer () {
  hypercloud.addServer(args.name, function (err, server) {
    if (err) throw err
    console.log('server created', server.settings)
  })
}

function backup () {
  if (!args.key) {
    console.error('hypercloud key required')
    process.exit(1)
  }
  var dir = args.dir || path.join(process.cwd(), 'backup')
  var db = args.db || '.backup'
  var cloud = Hypercloud({dbName: db, dir: dir})
  // get cloud
  cloud.createBackup(args.key)
}

function usage () {
  console.error('Welcome to hypercloud!')
  console.error('Usage')
  console.error('  start hypercloud:         hypercloud start')
  console.error('  add a new server:         hypercloud add --name server-name   ')
  console.error('  enter replication mode:   hypercloud replicate')
  console.error('  backup a hypercloud:      hypercloud backup --key hypercloud-key')
}
