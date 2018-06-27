/* global $ location */

// register page js
$(function () {
  // autofill email if email query paramater set
  if (location.search && location.search.substring(1).split('=').indexOf('email') !== -1) {
    var email = location.search.substring(1).split('=')[1]
    $('input[name="email"]').val(decodeURIComponent(email))
  }

  $('#input-password-confirm').on('blur', function (e) {
    if (e.target.value !== $('#input-password')[0].value) {
      $('#error-password-confirm')
        .text('Passwords don\'t match')
        .parent()
        .addClass('warning')
    } else {
      $('#error-password-confirm')
        .text('')
        .parent()
        .removeClass('warning')
    }
  })

  $('#register').on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    // post to api
    var xhr = $.post('/v2/accounts/register', values)
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
