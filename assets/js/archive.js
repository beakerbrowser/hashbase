/* global $ */

// archive page js
$(function () {
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
