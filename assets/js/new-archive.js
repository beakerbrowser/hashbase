/* global $ */

var DAT_KEY_REGEX = /([0-9a-f]{64})/i

$(function () {
  var addArchiveForm = $('#add-archive-form')
  var addArchiveKeyInput = $('#add-archive-key-input')
  var addArchiveNameInput = $('#add-archive-name-input')
  var addArchiveNameOutput = $('#add-archive-name-output')
  var addArchiveSubmitBtn = $('#add-archive-submit-btn')

  function getKeyVal () {
    var keyValRaw = addArchiveKeyInput.val()
    var keyMatch = DAT_KEY_REGEX.exec(keyValRaw)
    return (keyMatch) ? keyMatch[1] : false
  }

  // automatic url rendering
  addArchiveKeyInput.on('keyup', onChange)
  addArchiveNameInput.on('keyup', onChange)
  function onChange () {
    // extract sanitized values
    var keyVal = getKeyVal()
    var nameVal = addArchiveNameInput.val()

    // update the name output
    if (nameVal === window.params.username) {
      addArchiveNameOutput.text('')
    } else {
      addArchiveNameOutput.text((nameVal || '') + '-')      
    }

    // update submit button disabled state
    if (keyVal) addArchiveSubmitBtn.removeAttr('disabled')
    else addArchiveSubmitBtn.attr('disabled', true)

    // provide initial feedback about archive name
    if (!nameVal.match(/^([0-9a-zA-Z-]*)$/i))  {
      renderErrors({
        details: {
          name: {
            msg: 'Names must only contain characters, numbers, and dashes',
            param: 'name'
          }
        }
      })
    } else {
      $('#add-archive-name-error').text('').parent().removeClass('warning')
    }
  }

  // alter values prior to submission
  addArchiveSubmitBtn.on('click', function (e) {
    e.preventDefault()
    addArchiveKeyInput.val(getKeyVal())
    addArchiveForm.submit()
  })

  addArchiveForm.on('submit', function (e) {
    e.preventDefault()

    // serialize form values
    var values = {}
    $(this).serializeArray().forEach(function (value) {
      values[value.name] = value.value
    })

    // post to api
    var xhr = $.post('/v1/archives/add', values)
    xhr.done(function (res) {
      // success, redirect
      window.location = '/' + window.params.username + '/' + addArchiveNameInput.val()
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

  function renderErrors (json) {
    // individual form errors
    var details = json.details || {}
    ;(['key', 'name']).forEach(function (name) {
      if (details[name]) {
        $('#add-archive-' + name + '-error')
          .text(details[name].msg)
          .parent()
          .addClass('warning')
      } else {
        $('#add-archive-' + name + '-error')
          .text('')
          .parent()
          .removeClass('warning')
      }
    })
  }
})
