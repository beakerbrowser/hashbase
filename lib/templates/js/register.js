// register page js
$(function() {
  var usernameInput = $('#input-username')
  var usernameOutput = $('#output-username')
  output()
  usernameInput.on('keyup', output)
  function output () {
    usernameOutput.text(usernameInput.val() || 'username')
  }
})