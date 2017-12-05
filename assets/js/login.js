/* global $ URLSearchParams location */

// login page js
$(function () {
  var redirect
  if (window.URLSearchParams) {
    var queryParams = new URLSearchParams(location.search)
    redirect = queryParams.get('redirect') || ''
  } else { // This is needed for older browsers (MS Edge on or before december 2017) that do not support URLSearchParams
    var getQueryVariable = function (variable) {
      var query = window.location.search.substring(1)
      var vars = query.split('&')
      for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=')
        if (decodeURIComponent(pair[0]) === variable) {
          return decodeURIComponent(pair[1])
        }
      }
    }
    redirect = getQueryVariable('redirect') || ''
  }

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
