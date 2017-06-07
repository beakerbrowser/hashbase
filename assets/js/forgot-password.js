/* global $ */

// forgot password page js
$(function () {
  $('.form-forgot-password').on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    // post to api
    var xhr = $.post('/v1/forgot-password', values)
    xhr.done(function (res) {
      // success, tell user
      $('#success-msg').text('Check your email inbox for a reset link. Didn’t get one? Check that you entered your email address correctly.')
    })
  })
})
