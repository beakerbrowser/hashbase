/* global $ */

// clipboard js
$(function () {
  var copyButton = $('.copy-to-clipboard')

  copyButton.click(function (e) {
    // create a hidden input
    var input = document.createElement('textarea')
    document.body.appendChild(input)

    // get the text to select from the target element
    var targetEl = document.querySelector(this.dataset.target)

    // set the input's value and select the text
    input.value = targetEl.innerText
    input.select()

    // copy
    document.execCommand('copy')
    document.body.removeChild(input)

    // show feedback
    var feedbackEl = document.querySelector(this.dataset.feedbackEl)
    feedbackEl.innerText = 'Copied to clipboard'

    setTimeout(function () {
      feedbackEl.innerText = ''
    }, 2000);
  })
})
