/* global $ */

var DAT_KEY_REGEX = /([0-9a-f]{64})/i

$(function () {
  var addDatForm = $('#add-dat-form')
  var addDatKeyInput = $('#add-dat-key-input')
  var addDatNameInput = $('#add-dat-name-input')
  var addDatNameOutput = $('#add-dat-name-output')
  var addDatSubmitBtn = $('#add-dat-submit-btn')

  function getKeyVal () {
    var keyValRaw = addDatKeyInput.val()
    var keyMatch = DAT_KEY_REGEX.exec(keyValRaw)
    return (keyMatch) ? keyMatch[1] : false
  }

  // automatic url rendering
  addDatKeyInput.on('keyup', onChange)
  addDatNameInput.on('keyup', onChange)
  function onChange () {
    // extract sanitized values
    var keyVal = getKeyVal()
    var nameVal = addDatNameInput.val()

    // update the name output
    addDatNameOutput.text(nameVal || 'datname')

    // update submit button disabled state
    if (keyVal) addDatSubmitBtn.removeAttr('disabled')
    else addDatSubmitBtn.attr('disabled', true)
  }

  // alter values prior to submission
  addDatSubmitBtn.on('click', function (e) {
    e.preventDefault()
    addDatKeyInput.val(getKeyVal())
    addDatForm.submit()
  })
})
