/* global $ */

// archive page js
$(function () {
  var removeForm = $('#remove-archive-form')
  var adminRemoveForm = $('#admin-remove-archive-form')

  $('#show-remove-archive-form').on('click', function () {
    removeForm.addClass('open')
    adminRemoveForm.addClass('open')
  })

  $('#cancel-remove-archive').on('click', function (e) {
    e.preventDefault()
    removeForm.removeClass('open')
    adminRemoveForm.removeClass('open')
  })

  adminRemoveForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = serializeValues(this)

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

  removeForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = serializeValues(this)

    var xhr = $.post('/v1/archives/remove', values)
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

  function serializeValues (doc) {
    // serialize form values
    var values = {}
    $(doc).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })
    return values
  }

  function renderErrors (json) {
    // general error
    $('#error-general').text(json.message || json)
  }
})
