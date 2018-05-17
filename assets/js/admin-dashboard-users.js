/* global $ makeSafe moment */

// admin user tools
$(function () {
  setupUsersTable()
})

function setupUsersTable () {
  var table = $('.users-table')
  table = table.DataTable({
    order: [[ 9, 'desc' ]],
    pageLength: 50,
    ajax: {
      url: '/v2/admin/users?view=dashboard',
      headers: {accept: 'application/json'},
      data: {},
      dataSrc: 'users'
    },
    columns: [
      {data: colValue('id')},
      {data: colValue('username')},
      {data: colValue('email')},
      {data: colValue('numArchives')},
      {data: colValue('diskUsage'), type: 'file-size'},
      {data: colValue('diskQuota'), type: 'file-size'},
      {data: colValue('plan')},
      {data: colBool('isEmailVerified')},
      {data: suspension},
      {data: colDate('createdAt')}
    ]
  })
  table.on('click', 'tr', function () {
    window.open('/v2/admin/users/' + table.row($(this)).data().id)
  })
}

// helpers to construct the data
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
function suspension (row) {
  return row.suspension ? `<strong>SUSPENDED</strong>` : ''
}
function colDate (col) {
  return row => moment(row[col]).format('YYYY/MM/DD')
}
