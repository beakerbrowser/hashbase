/* global $ */

// clipboard js
$(function () {
  var copyButton = $('.copy-to-clipboard')

  copyButton.click(function (e) {
    e.preventDefault()
    e.stopPropagation()

    // create a hidden input
    var input = document.createElement('textarea')
    document.body.appendChild(input)

    // get the text to select from the target element
    var targetEl = document.querySelector(this.dataset.target)

    // set the input's value and select the text
    input.value = targetEl.innerText
    input.select()

    // input.style.position = 'relative'

    // copy
    document.execCommand('copy')
    document.body.removeChild(input)

    // show feedback
    var feedbackEl = document.querySelector(this.dataset.feedbackEl)
    feedbackEl.classList.add('tooltip')
    feedbackEl.innerText = 'Copied to clipboard'

    setTimeout(function () {
      feedbackEl.innerText = ''
    }, 1500)
  })
})
