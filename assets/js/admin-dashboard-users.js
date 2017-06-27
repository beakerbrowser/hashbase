/* global $ */

// admin user tools
$(function () {
  setupUsersTable()
})

function setupUsersTable () {
  var table = $('.users-table')
  table = table.DataTable({
   order: [[ 0, 'desc' ]],
    ajax: {
      url: '/v1/admin/users',
      headers: {accept: 'application/json'},
      data: {},
      dataSrc: 'users'
    },
    columns: [
      {data: colValue('id')},
      {data: colValue('username')},
      {data: colValue('email')},
      {data: numArchives},
      {data: colValue('diskUsage')},
      {data: colValue('diskQuota')},
      {data: colValue('plan')},
      {data: colBool('isEmailVerified')},
      {data: colBool('suspension')},
      {data: colDate('createdAt')}
    ]
  })
  table.on('click', 'tr', function () {
    window.location = '/v1/admin/users/' + table.row($(this)).data().id
  })
}

// helpers to construct the data
function numArchives (row) {
  return row.archives.length
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
function colBool (col) {
  return row => `<i class="fa fa-${(row[col]) ? 'check' : 'times'}"></i>`
}
function colDate (col) {
  return row => moment(row[col]).format('YYYY/MM/DD')
}