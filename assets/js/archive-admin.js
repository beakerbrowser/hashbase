/* global $ location params */

// admin tools on archive
$(function () {
  var adminRemoveForm = $('#admin-remove-archive-form')


  $('#show-admin-remove-archive-form').on('click', function () {
    adminRemoveForm.addClass('open')
  })

  $('#cancel-admin-remove-archive').on('click', function (e) {
    e.preventDefault()
    adminRemoveForm.removeClass('open')
  })

  adminRemoveForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    // post to api
    var xhr = $.post('/v1/admin/archives/' + values['key'] + '/remove', values)

    xhr.done(function (res) {
      // success, redirect
      window.location = '/profile'
    })

    xhr.fail(function (res) {
      // failure, render errors
      try {
        renderErrors(JSON.parse(res.responseText))
      } catch (e) {
        renderErrors(res.responseText)
      }
    })
  })

  $('#admin-toggle-featured').click(function () {
    var act = params.isFeatured ? 'unfeature' : 'feature'
    $.post('/v1/admin/archives/' + params.key + '/' + act, function (response, status) {
      if (status !== 'success') {
        return console.error(status, response)
      }
      location.reload()
    })
  })

  function renderErrors (json) {
    // general error
    $('#error-admin-general').text(json.message || json)
  }
})
