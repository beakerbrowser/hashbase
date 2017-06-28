/* global $ d3 */

// admin tools on archive
$(function () {
  setupVisitorsTable()
})

function setupVisitorsTable () {
  $('.visits-table').DataTable({
    ajax: {
      url: '/v1/admin/analytics/visits-count',
      data: {groupBy: 'url', unique: '1'},
      dataSrc: ''
    },
    columns: [
      {data: 'event'},
      {data: 'url'},
      {data: 'session'},
      {data: 'session'},
      {data: 'ip'},
      {data: 'ip'},
      {data: 'browser'},
      {data: 'version'},
      {data: 'os'},
      {data: 'date'}
    ]
  })
}
