/* global $ */

// admin user tools
$(function () {
  setupReportsTable()
})

function setupReportsTable () {
  var table = $('.reports-table')
  table = table.DataTable({
    order: [[ 1, 'desc' ]],
    pageLength: 50,
    ajax: {
      url: '/v1/admin/reports',
      headers: {accept: 'application/json'},
      data: {},
      dataSrc: 'reports'
    },
    columns: [
      {data: colValue('id')},
      {data: colValue('archiveKey')},
      {data: colValue('archiveOwner')},
      {data: colValue('reportedBy')},
      {data: colValue('reason')},
      {data: colValue('reportedAt')},
      {data: colValue('notes')},
      {data: colValue('status')}
    ]
  })
  table.on('click', 'tr', function () {
    console.log(table.row($(this)).data())
    window.location = '/v1/admin/reports/' + table.row($(this)).data().id
  })
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