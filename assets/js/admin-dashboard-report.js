/* global $ */

// admin user tools
$(function () {
  // auto-size the record content
  var textarea = $('textarea')
  textarea.height(textarea[0].scrollHeight)

  // save
  $('#save-btn').on('click', function () {
    try {
      var data = JSON.parse(textarea.val())
    } catch (e) {
      return onError({responseText: e.toString()}, 0, 'Error parsing JSON')
    }
    $('#error-general').text('')
    $.ajax(window.location.pathname, {method: 'post', contentType: 'application/json; charset=utf-8', dataType: 'json', data: JSON.stringify(data)})
      .done(onUpdate)
      .fail(onError)
  })

  // close
  $('#close-btn').on('click', function () {
    $('#error-general').text('')
    $.ajax(window.location.pathname + '/close', {method: 'post', contentType: 'application/json; charset=utf-8', data: JSON.stringify({})})
      .done(onUpdate)
      .fail(onError)
  })

  // open
  $('#open-btn').on('click', function () {
    $('#error-general').text('')
    $.ajax(window.location.pathname + '/open', {method: 'post', contentType: 'application/json; charset=utf-8', data: JSON.stringify({})})
      .done(onUpdate)
      .fail(onError)
  })
})

function onUpdate () {
  window.location.reload()
}

function onError (jqXHR, _, err) {
  $('#error-general').text(err + ' ' + jqXHR.responseText)
}
