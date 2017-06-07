/* global $ */

// register page js
$(function () {
  // auto-render profile url on user changes
  var usernameInput = $('#input-username')
  var usernameOutput = $('#output-username')
  output()
  usernameInput.on('keyup', output)
  function output () {
    usernameOutput.text(usernameInput.val() || 'username')
  }

  $('#register').on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    // post to api
    var xhr = $.post('/v1/register', values)
    xhr.done(function (res) {
      // success, redirect
      if (location.search && location.search.substring(1).split('=').indexOf('pro') !== -1) {
        window.location = '/register/pro?id=' + res.id + '&email=' + escape(values.email)
      } else {
        window.location = '/registered?email=' + escape(values.email)
      }
    })
    xhr.fail(function (res) {
      // failure, render errors
      try {
        renderErrors(JSON.parse(res.responseText))
      } catch (e) {
        renderErrors({message: res.responseText})
      }
    })
  })

  function renderErrors (json) {
    // general error
    $('#error-general').text(json.message || json)

    // individual form errors
    var details = json.details || {}
    ;(['username', 'email', 'password']).forEach(function (name) {
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
