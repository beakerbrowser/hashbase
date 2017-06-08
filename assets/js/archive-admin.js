/* global $ location params */

// admin tools on archive
$(function () {
  $('#admin-toggle-featured').click(function () {
    var act = params.isFeatured ? 'unfeature' : 'feature'
    $.post('/v1/admin/archives/' + params.key + '/' + act, function (response, status) {
      if (status !== 'success') {
        return console.error(status, response)
      }
      location.reload()
    })
  })
})
