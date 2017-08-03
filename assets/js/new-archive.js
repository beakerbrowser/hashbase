/* global $ DatArchive */

var DAT_KEY_REGEX = /([0-9a-f]{64})/i

$(function () {
  var addArchiveForm = $('#add-archive-form')
  var addArchiveKeyInput = $('#add-archive-key-input')
  var addArchiveNameInput = $('#add-archive-name-input')
  var addArchiveNameOutput = $('#add-archive-name-output')
  var addArchiveNameOutputContainer = $('#add-archive-name-output-container')
  var addArchiveSubmitBtn = $('#add-archive-submit-btn')
  var toggleables = $('[data-target]')

  toggleables.forEach(function (el) {
    el.addEventListener('click', toggleHowto)
  })
  setupDatPicker()
  addArchiveNameOutputContainer[0].style.opacity = '0'

  function setupDatPicker () {
    if (!('DatArchive' in window)) {
      return
    }

    var datPicker = $('.dat-picker')
    datPicker.parent().addClass('enabled')
    datPicker.click(onPickDat)
  }

  function onPickDat () {
    DatArchive.selectArchive().then(url => {
      addArchiveKeyInput.val(url)
    })
  }

  function toggleHowto (e) {
    var content = $(e.currentTarget.dataset.target)
    var icon = e.currentTarget.childNodes[3]

    content.toggleClass('visible')

    if (icon.classList.contains('fa-caret-right')) {
      icon.classList.remove('fa-caret-right')
      icon.classList.add('fa-caret-down')
    } else {
      icon.classList.remove('fa-caret-down')
      icon.classList.add('fa-caret-right')
    }
  }

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

    if (nameVal.length) {
      addArchiveNameOutputContainer[0].style.opacity = 1
    } else {
      addArchiveNameOutputContainer[0].style.opacity = 0
    }

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
    if (!nameVal.match(/^([0-9a-zA-Z-]*)$/i)) {
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
    addArchiveKeyInput.val(getKeyVal())

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
    if (json.outOfSpace || json.message) {
      $('#error-general').text(json.message)
    } else {
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
  }
})
