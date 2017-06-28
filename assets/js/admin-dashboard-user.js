/* global $ */

// admin user tools
$(function () {
  // auto-size the record content
  var textarea = $('.record-content textarea')
  textarea.height(textarea[0].scrollHeight)

  // save
  $('#save-btn').on('click', function () {
    var data = textarea.val()
    $('#error-general').text('')
    $.ajax(location.pathname, {method: 'post', contentType: 'application/json; charset=utf-8', dataType: 'json', data})
      .done(onUpdate)
      .fail(onError)
  })

  // suspend
  $('#suspend-btn').on('click', function () {
    var data = {reason: prompt('Reason?')}
    if (!data.reason) return
    data = JSON.stringify(data)
    $('#error-general').text('')
    $.ajax(location.pathname + '/suspend', {method: 'post', contentType: 'application/json; charset=utf-8', data})
      .done(onUpdate)
      .fail(onError)
  })

  // unsuspend
  $('#unsuspend-btn').on('click', function () {
    if (!confirm('Unsuspend?')) return
    $('#error-general').text('')
    $.ajax(location.pathname + '/unsuspend', {method: 'post'})
      .done(onUpdate)
      .fail(onError)
  })
})

function onUpdate () {
  location.reload()
}

function onError (jqXHR, _, err) {
  $('#error-general').text(err + ' ' + JSON.stringify(jqXHR.responseJSON))
}