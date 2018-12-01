const path = require('path')
const fs = require('fs')
const figures = require('figures')
const SQL = require('sql-template-strings')
const {ask} = require('../../helpers')

const Legacy = {
  activity: require('./activity'),
  archives: require('./archives'),
  featuredArchives: require('./featured-archives'),
  reports: require('./reports'),
  users: require('./users')
}

var sql = ''

exports.migrateAsNeeded = async function (cloud, dataPath) {
  var dbPath = path.join(dataPath, 'db')
  if (fs.existsSync(dbPath)) {
    console.log('')
    console.log(figures.star, 'A database migration is required!')
    console.log(figures.heart, 'Don\'t worry, this will be easy.')
    var sqlFilePath = path.join(dataPath, 'legacy-leveldb-to-sqlite-dump.sql')
    var archivedDbPath = path.join(dataPath, 'legacy-leveldb')
    var newDbPath = path.join(dataPath, 'main.db')
    await generateMigrationDump(dbPath, sqlFilePath)
    await generateSqliteDb(cloud)
    console.log(figures.info, 'SQL File:', sqlFilePath)
    console.log(figures.info, 'The old database will be archived at', archivedDbPath)
    console.log(figures.info, 'The new database is at', newDbPath)
    if (!(await ask(figures.play + ' Are you ready to run the migration? (Y/n)', 'y'))) {
      console.log('Okay.')
      console.log('We need to run this migration to start, so Hashbase is now going to close.')
      console.log(figures.pointerSmall, 'Shutting down.')
      process.exit(0)
    }
    archiveOldDb(dbPath, archivedDbPath)
    console.log(figures.star, 'A database migration complete!')
    console.log('')
    process.exit(0)
  }
}

async function generateMigrationDump (dbPath, migrationDumpPath) {
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
  nuke('users')
  for (let user of await dbs.users.list()) {
    if (user.archives) {
      user.archives.forEach(a => {
        usersArchives.push({userid: user.id, key: a.key, name: a.name})
      })
    }
    insert('users', toUserRecord(user))
  }
  console.log(figures.pointerSmall, 'Archives...')
  nuke('archives')
  for (let archive of await dbs.archives.list()) {
    archive.isFeatured = await dbs.featuredArchives.has(archive.key)
    insert('archives', toArchiveRecord(archive))
  }
  console.log(figures.pointerSmall, 'Users->Archives...')
  nuke('users_archives')
  for (let userArchive of usersArchives) {
    insert('users_archives', toUserArchiveRecord(userArchive))
  }
  console.log(figures.pointerSmall, 'Reports...')
  nuke('reports')
  for (let report of await dbs.reports.list()) {
    insert('reports', toReportRecord(report))
  }
  console.log(figures.pointerSmall, 'Activity...')
  nuke('activity')
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

  console.log(figures.star, 'Dataset extracted.')

  function nuke (table) {
    query = `DELETE FROM ${table};\n`
    ws.write(query)
    sql += query
  }

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
    sql += query
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
  v = JSON.stringify(v)
  if (typeof v === 'string') v = v.replace(/\\"/g, '""')
  if (typeof v === 'undefined') v = null
  return v
}

async function generateSqliteDb (cloud) {
  // execute dump
  console.log(figures.pointerSmall, 'Generating new db...')
  await cloud.db.exec(sql)
}

function archiveOldDb (dbPath, archivedDbPath) {
  console.log(figures.pointerSmall, 'Archiving old db...')
  fs.renameSync(dbPath, archivedDbPath)
}