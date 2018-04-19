/* global $ makeSafe moment */

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
      url: '/v2/admin/reports?view=dashboard',
      headers: {accept: 'application/json'},
      data: {},
      dataSrc: 'reports'
    },
    columns: [
      {data: colValue('archiveKey')},
      {data: colValue('archiveOwner')},
      {data: colValue('reportingUser')},
      {data: colValue('reason')},
      {data: colDate('createdAt')},
      {data: colValue('notes')},
      {data: colValue('status')}
    ]
  })
  table.on('click', 'tr', function () {
    window.location = '/v2/admin/reports/' + table.row($(this)).data().id
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
