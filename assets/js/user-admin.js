/* global $ */

// user page admin js
$(function () {
  var sendEmailForm = $('#send-email')

  sendEmailForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    // post to api
    $.post('/v2/admin/users/' + values['username'] + '/send-email', values, function (res, status) {
      if (status !== 'success') console.error(status, res)
      else {
        $('#send-email-success').text('Sent message to ' + values['username'])
        sendEmailForm[0].reset()
      }
    })
  })
})
