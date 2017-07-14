/* global $ */

// account cancel plan page js
$(function () {
  // form submit
  $('.form-account-cancel-plan').on('submit', function (e) {
    e.preventDefault()

    toggleSpinner(true)

    // post to api
    var xhr = $.post('/v1/account/cancel-plan', {
      _csrf: $('[name=_csrf]').val()
    })
    xhr.done(function (res) {
      // success, redirect
      window.location = '/account/canceled-plan'
    })
    xhr.fail(function (res) {
      // failure, render errors
      toggleSpinner(false)
      try {
        var resObj = JSON.parse(res.responseText)
      } catch (e) {}
      $('#errors').text((resObj && resObj.message) || 'Internal server error. Please contact support.')
    })
  })

  function toggleSpinner (on) {
    if (on) {
      $('#submit-btn').attr('disabled', 'disabled').html('Processing...<i class="fa fa-circle-o-notch fa-spin fa-fw"></i>')
    } else {
      $('#submit-btn').attr('disabled', null).html('Yes, cancel it')
    }
  }
})
