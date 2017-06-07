/* global $ */

// register page js
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
    toggleSpinner(true)
    stripe.createToken(card).then(function (result) {
      if (result.error) {
        toggleSpinner(false)
        $('#card-errors').text(result.error.message)
        return
      }

      // post to api
      var token = result.token
      var xhr = $.post('/v1/hashbase-accounts/register/pro', {
        token: token,
        id: document.forms[0].id.value
      })
      xhr.done(function (res) {
        // success, redirect
        window.location = '/registered?email=' + document.forms[0].email.value
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

  function toggleSpinner (on) {
    if (on) {
      $('#submit-btn').attr('disabled', 'disabled').html('<i class="fa fa-circle-o-notch fa-spin fa-fw"></i>')
    } else {
      $('#submit-btn').attr('disabled', null).html('<i class="fa fa-arrow-circle-up"></i> Upgrade')
    }
  }
})
