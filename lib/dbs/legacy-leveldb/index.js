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
  // TODO

  // iterate and dump datasets
  console.log(figures.pointerSmall, 'Users...')
  for (let user of await dbs.users.list()) {
    insert('users', toUserRecord(user))
  }
  console.log(figures.pointerSmall, 'Archives...')
  for (let archive of await dbs.archives.list()) {
    insert('archives', archive)
  }
  console.log(figures.pointerSmall, 'Users->Archives...')
  // TODO
  console.log(figures.pointerSmall, 'Reports...')
  for (let report of await dbs.reports.list()) {
    insert('reports', report)
  }
  console.log(figures.pointerSmall, 'Activity...')
  for (let act of await dbs.activity.listGlobalEvents()) {
    insert('activity', act)
  }

  // close output stream
  // TODO

  // close the leveldb
  // TODO

  // return the path to the output stream

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
    query += `)`

    // write
    // TODO
    console.log(query)
  }
}

function toUserRecord (record) {
  record.scopes = record.scopes.join(',')
  if (record.emailVerifyNonce) {
    record.emailVerificationNonce = record.emailVerifyNonce
    delete record.emailVerifyNonce
  }
  delete record.archives
  return record
}

function escapeValue (v) {
  if (typeof v === 'boolean') return Number(v)
  return JSON.stringify(v)
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