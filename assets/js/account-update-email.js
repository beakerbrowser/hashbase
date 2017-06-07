/* global $ URL */

// update email page js
$(function () {
  $('.form-update-email').on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    // post to api
    var xhr = $.post('/v1/account/email', values)
    xhr.done(function (res) {
      $('#success-msg').text('Click the verification link sent to ' + values.newEmail + ' to finish updating your account.')
      $('#error-general').text('')
      $('.form-desc').text('')
      $('input').val('')
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
    $('#error-general').text(json.message)

    // individual form errors
    var details = json.details || {}
    ;(['newEmail', 'password']).forEach(function (name) {
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
