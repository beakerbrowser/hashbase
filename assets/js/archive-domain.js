/* global $ window */

// archive domains page js
$(function () {
  $('#add-domain-form').on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    var xhr = $.post('/v1/domains/add', values)
    xhr.done(function (res) {
      // success, redirect
      window.location = '/' + window.params.username + '/' + window.params.archivename + '/domains/' + values.domain
    })
    xhr.fail(onFail)
  })

  $('#remove-domain').click(function (e) {
    e.preventDefault()

    if (!confirm('Are you sure you want to remove this domain?')) {
      return
    }

    var xhr = $.post('/v1/domains/remove', {id: window.params.domainRecordID, _csrf: window.params.csrf})
    xhr.done(function (res) {
      // success, redirect
      window.location = '/' + window.params.username + '/' + window.params.archivename
    })
    xhr.fail(onFail)
  })

  function onFail (res) {
    // failure, render errors
    try {
      renderErrors(JSON.parse(res.responseText))
    } catch (e) {
      renderErrors(res.responseText)
    }
  }

  function renderErrors (json) {
    // general error
    $('#error-general').text(json.message || json)
  }
})
