/* global $ params */

// archive page js
$(function () {
  var removeForm = $('#remove-archive-form')
  var customDomainForm = $('#custom-domain-form')
  var urlBtns = $('.link-btns .label')

  urlBtns.forEach(function (el) {
    el.onclick = updateActiveURL
  })

  $('#show-remove-archive-form').on('click', function () {
    removeForm.addClass('open')
  })

  $('#cancel-remove-archive').on('click', function (e) {
    e.preventDefault()
    removeForm.removeClass('open')
  })

  removeForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

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

  customDomainForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    var xhr = $.post('/v1/admin/archives/' + params.key + '/domain', values)
    xhr.done(function (res) {
      // success, redirect
      renderSuccess({message: 'Custom domain saved.'})
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

  function updateActiveURL (e) {
    urlBtns.forEach(function (el) {
      el.classList.remove('selected')
    })

    e.target.classList.add('selected')
  }

  function renderSuccess (json) {
    $('#feedback-general').text(json.message || json)
  }

  function renderErrors (json) {
    // general error
    $('#error-general').text(json.message || json)
  }
})
