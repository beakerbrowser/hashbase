/* global $ */

// report form js
$(function () {
  $('#show-report-archive-form').on('click', showReportArchiveForm)
  $('#cancel-report-btn').on('click', hideReportArchiveForm)
  $('#report-archive-form').on('submit', submitReport)

  function showReportArchiveForm () {
    $('#report-archive-form').parent().addClass('visible')
  }

  function hideReportArchiveForm () {
    $('#report-archive-form').parent().removeClass('visible')
  }

  function submitReport (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    var xhr = $.post('/v1/reports/add', values)
    xhr.done(function (res) {
      hideReportArchiveForm()
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
    if (json.invalidInputs) {
      $('#report-archive-form #error-general').text('Please select a reason')
    } else {
      // general error
      $('#report-archive-form #error-general').text(json.message || json)
    }
  }
})
