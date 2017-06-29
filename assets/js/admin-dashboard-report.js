/* global $ */

// admin user tools
$(function () {
  // auto-size the record content
  var textarea = $('textarea')
  textarea.height(textarea[0].scrollHeight)

  // save
  $('#save-btn').on('click', function () {
    var data = textarea.val()
    $('#error-general').text('')
    $.ajax(location.pathname, {method: 'post', contentType: 'application/json; charset=utf-8', dataType: 'json', data})
      .done(onUpdate)
      .fail(onError)
  })

  // close
  $('#close-btn').on('click', function () {
    $('#error-general').text('')
    $.ajax(location.pathname + '/close', {method: 'post', contentType: 'application/json; charset=utf-8'})
      .done(onUpdate)
      .fail(onError)
  })

  // open
  $('#open-btn').on('click', function () {
    $('#error-general').text('')
    $.ajax(location.pathname + '/open', {method: 'post'})
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