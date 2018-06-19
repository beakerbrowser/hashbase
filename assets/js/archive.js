/* global $ */

// archive page js
$(function () {
  var renameForm = $('#rename-form')
  var renameFormInput = $('#rename-form #input-name')
  var removeForm = $('#remove-archive-form')
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

  renameFormInput.on('keyup', function (e) {
    var name = renameFormInput.val()
    var isChanged = name !== params.name
    var url = 'dat://' + (name ? (name + '.' + params.hostname) : params.key)
    $('#feedback-name .is-will-be').text(isChanged ? 'will be': 'is')
    $('#feedback-name .link').attr('href', url)
    $('#feedback-name .link').text(name ? url : (url.slice(0, 12) + '..' + url.slice(-2)))
    if (isChanged) $('#rename-form .btn').removeAttr('disabled')
    else $('#rename-form .btn').attr('disabled', true)
  })

  renameForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })
    if (!values.name) {
      delete values.name
    }

    var xhr = $.post('/v2/archives/item/' + params.key, values)
    xhr.done(function (res) {
      // success, redirect
      window.location = '/' + params.owner + '/' + (values.name || params.key)
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

  removeForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    var xhr = $.post('/v2/archives/remove', values)
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

  function updateActiveURL (e) {
    urlBtns.forEach(function (el) {
      el.classList.remove('selected')
    })

    e.target.classList.add('selected')
  }

  function renderErrors (json) {
    // general error
    $('#error-general').text(json.message || json)
  }
})
