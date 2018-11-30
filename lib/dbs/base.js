var EventEmitter = require('events')
var SQL = require('sql-template-strings')

class Base extends EventEmitter {
  constructor (cloud, table, primaryKey) {
    super()
    this.cloud = cloud
    this.table = table
    this.primaryKey = primaryKey
    this.columns = []
  }

  async setup () {
    this.columns = (await this.cloud.db.all(`pragma table_info(${this.table});`)).map(column => column.name)
  }

  createInsertQuery (record) {
    var query = SQL`INSERT INTO`
    query.append(` ${this.table} `)

    var first = true
    query.append(`(`)
    this.columns.forEach(k => {
      if (!(k in record)) return
      if (!first) query.append(`, `)
      query.append(k)
      first = false
    })
    query.append(`)`)

    query.append(` VALUES `)

    first = true
    query.append(`(`)
    this.columns.forEach(k => {
      if (!(k in record)) return
      if (!first) query.append(`, `)
      query.append(SQL`${record[k]}`)
      first = false
    })
    query.append(`)`)

    // console.log('createInsertQuery', this.table, this.primaryKey, this.columns, record, query)

    return query
  }

  createUpdateQuery (record) {
    var query = SQL`UPDATE`
    query.append(` ${this.table} SET `)

    var first = true
    this.columns.forEach(k => {
      if (k === this.primaryKey) return
      if (!(k in record)) return
      if (!first) query.append(`, `)
      query.append(k)
      query.append(SQL` = ${record[k]}`)
      first = false
    })

    query.append(` WHERE ${this.primaryKey}`)
    query.append(SQL` = ${record[this.primaryKey]}`)

    // console.log('createUpdateQuery', this.table, this.primaryKey, this.columns, record, query)
    return query
  }
}

module.exports = Base