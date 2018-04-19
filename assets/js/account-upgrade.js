/* global $ Stripe */

// account upgrade page js
$(function () {
  // create stripe elements
  var stripe = Stripe(window.params.stripePK)
  var elements = stripe.elements()
  var card = elements.create('card', {style: {
    base: {
      color: '#32325d',
      lineHeight: '24px',
      fontFamily: 'Helvetica Neue',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4'
      }
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a'
    }
  }})
  card.mount('#card-element')

  // render errors
  card.addEventListener('change', function (e) {
    $('#card-errors').text(e.error ? e.error.message : '')
    $('#submit-btn').attr('disabled', !e.complete ? 'disabled' : null)
  })

  // form submit
  $('#form-account-upgrade').on('submit', function (e) {
    e.preventDefault()

    toggleSpinner(true)
    stripe.createToken(card).then(function (result) {
      if (result.error) {
        toggleSpinner(false)
        console.error('Error', result)
        $('#error-general').text(result.error.message)
        return
      }

      // post to api
      var token = result.token
      var xhr = $.post('/v2/accounts/account/upgrade', {
        _csrf: $('#form-account-upgrade [name=_csrf]').val(),
        token: token
      })
      xhr.done(function (res) {
        // success, redirect
        window.location = '/account/upgraded'
      })
      xhr.fail(function (res) {
        // failure, render errors
        toggleSpinner(false)
        try {
          var resObj = JSON.parse(res.responseText)
        } catch (e) {}
        console.error('Error', res)
        $('#error-general').text((resObj && resObj.message) || 'Internal server error. Please contact support.')
      })
    })
  })

  function toggleSpinner (on) {
    if (on) {
      $('#submit-btn').attr('disabled', 'disabled').html('Processing...<i class="fa fa-circle-o-notch fa-spin fa-fw"></i>')
    } else {
      $('#submit-btn').attr('disabled', null).html('Upgrade<i class="fa fa-arrow-circle-up"></i>')
    }
  }
})
