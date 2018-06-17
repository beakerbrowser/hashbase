/* global $ makeSafe moment */

// admin archive tools
$(function () {
  setupArchivesTable()
})

function setupArchivesTable () {
  var table = $('.archives-table')
  table = table.DataTable({
    order: [[ 5, 'desc' ]],
    pageLength: 50,
    ajax: {
      url: '/v2/admin/archives?view=dashboard',
      headers: {accept: 'application/json'},
      data: {},
      dataSrc: 'archives'
    },
    columns: [
      {data: colKey('key')},
      {data: colValue('name')},
      {data: colValue('owner')},
      {data: colValue('diskUsage'), type: 'file-size'},
      {data: colValue('totalSize'), type: 'file-size'},
      {data: colDate('createdAt')}
    ]
  })
  table.on('click', 'tr', function () {
    window.open('/v2/admin/archives/' + table.row($(this)).data().key)
  })
}

// helpers to construct the data
function colKey (col) {
  return row => {
    var v = '' + row[col]
    return makeSafe(v.slice(0, 6) + '..' + v.slice(-2))
  }
}
function colValue (col) {
  return row => {
    var v = row[col]
    if (v || v === 0) {
      return makeSafe(v.toString())
    }
    return `<em>(${makeSafe('' + v)})</em>`
  }
}
function colDate (col) {
  return row => moment(row[col]).format('YYYY/MM/DD')
}
