const path = require('path')
const fs = require('fs')
const figures = require('figures')
const {promisify} = require('util')
const exists = promisify(fs.exists)
const SQL = require('sql-template-strings')

const Legacy = {
  activity: require('./activity'),
  archives: require('./archives'),
  featuredArchives: require('./featured-archives'),
  reports: require('./reports'),
  users: require('./users')
}

exports.migrateAsNeeded = async function (dataPath) {
  var dbPath = path.join(dataPath, 'db')
  if (await exists(dbPath)) {
    console.log('')
    console.log(figures.play, 'Legacy LevelDB detected. Executing migration to SQLite...')
    var migrationDumpPath = path.join(dataPath, 'leveldb-to-sqlite-dump.sql')
    await generateMigrationDump(dbPath, migrationDumpPath)
    await askToProceed(migrationDumpPath)
    await executeMigrationDump(migrationDumpPath)
    await archiveOldDb(dbPath, migrationDumpPath)
  }
}

async function generateMigrationDump (dbPath, migrationDumpPath) {
  console.log(figures.info, 'Generating migration data-dump file at', migrationDumpPath)

  // open the leveldb
  var level = require('level')
  var levelInstance = level(dbPath, { valueEncoding: 'json' })
  var dbs = {}
  for (let k in Legacy) {
    dbs[k] = new Legacy[k](levelInstance)
  }

  // open output stream
  var ws = fs.createWriteStream(migrationDumpPath)

  // iterate and dump datasets
  var usersArchives = []
  console.log(figures.pointerSmall, 'Users...')
  for (let user of await dbs.users.list()) {
    if (user.archives) {
      user.archives.forEach(a => {
        usersArchives.push({userid: user.id, key: a.key, name: a.name})
      })
    }
    insert('users', toUserRecord(user))
  }
  console.log(figures.pointerSmall, 'Archives...')
  for (let archive of await dbs.archives.list()) {
    archive.isFeatured = await dbs.featuredArchives.has(archive.key)
    insert('archives', toArchiveRecord(archive))
  }
  console.log(figures.pointerSmall, 'Users->Archives...')
  for (let userArchive of usersArchives) {
    insert('users_archives', toUserArchiveRecord(userArchive))
  }
  console.log(figures.pointerSmall, 'Reports...')
  for (let report of await dbs.reports.list()) {
    insert('reports', toReportRecord(report))
  }
  console.log(figures.pointerSmall, 'Activity...')
  for (let act of await dbs.activity.listGlobalEvents()) {
    insert('activity', toActivityRecord(act))
  }

  // close output stream
  await new Promise((resolve, reject) => {
    ws.end((err) => {
      if (err) reject(err)
      else resolve()
    })
  })

  // close the leveldb
  await new Promise((resolve, reject) => {
    levelInstance.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })

  function insert (table, record) {
    // construct the query
    var query = `INSERT INTO ${table} `

    var first = true
    query += `(`
    for (let k in record) {
      if (!first) query += `, `
      query += k
      first = false
    }
    query += `)`

    query += ` VALUES `

    first = true
    query += `(`
    for (let k in record) {
      if (!first) query += `, `
      query += escapeValue(record[k])
      first = false
    }
    query += `);\n`

    // write
    ws.write(query)
  }
}

function toUserRecord (record) {
  record.scopes = record.scopes.join(',')
  if ('emailVerifyNonce' in record) {
    record.emailVerificationNonce = record.emailVerifyNonce
    delete record.emailVerifyNonce
  }
  delete record.archives
  return record
}

function toArchiveRecord (record) {
  delete record.hostingUsers
  delete record.ownerName
  delete record.name
  return record
}

function toUserArchiveRecord (record) {
  return record
}

function toReportRecord (record) {
  delete record.id // now auto-generated
  return record
}

function toActivityRecord (record) {
  delete record.key // now auto-generated
  if (record.params) {
    record.params = JSON.stringify(record.params)
  }
  return record
}

function escapeValue (v) {
  if (typeof v === 'boolean') return Number(v)
  return JSON.stringify(v).replace(/\\"/g, '""')
}

async function askToProceed (migrationDumpPath) {
  // prompt the user to proceed
  // TODO
  process.exit(0)
}

async function executionMigrationDump (migrationDumpPath) {
  // read migration dump
  // TODO

  // execute dump
  // TODO
}

async function archiveOldDb (dbPath, migrationDumpPath) {
  // create archival folder
  // TODO

  // move DB files
  // TODO

  // move migration script
  // TODO
}