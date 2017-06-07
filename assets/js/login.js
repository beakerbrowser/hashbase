/* global $ */

// login page js
$(function () {
  var queryParams = new URLSearchParams(location.search)
  var redirect = queryParams.get('redirect') || ''

  $('.form-login').on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    // post to api
    var xhr = $.post('/v1/login', values)
    xhr.done(function (res) {
      // success, redirect
      window.location = '/' + redirect
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

  function renderErrors (json) {
    // general error
    $('#error-general').text(json.message || json)

    // individual form errors
    var details = json.details || {}
    ;(['username', 'password']).forEach(function (name) {
      if (details[name]) {
        $('#error-' + name)
          .text(details[name].msg)
          .parent()
          .addClass('warning')
      } else {
        $('#error-' + name)
        .text('')
        .parent()
        .removeClass('warning')
      }
    })
  }
})
