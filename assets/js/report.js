/* global $ */

// report form js
$(function () {
  $('#show-report-archive-form').on('click', showReportArchiveForm)
  $('#report-archive-form').on('submit', submitReport)

  $('#cancel-report-btn').on('click', hideForm)

  function hideForm () {
    $('.modal-form-container').removeClass('visible')
  }

  function showReportArchiveForm () {
    $('.modal-form-container').addClass('visible')
  }

  function submitReport (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    var xhr = $.post('/v2/reports/add', values)
    xhr.done(function (res) {
      hideForm()
      $('#feedback-general').text('Thanks, your report has been sent to the Hashbase admins')
    })

    xhr.fail(function (res) {
      // failure, render errors
      try {
        renderErrors(JSON.parse(res.responseText))
      } catch (e) {
        renderErrors(res.responseText)
      }
    })
  }

  function renderErrors (json) {
    // general error
    $('form #error-general').text(json.message || json)
  }
})
