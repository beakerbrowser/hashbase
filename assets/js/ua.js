/* global $ */

// ua js
$(function () {
  var beakerPrompts = $('.beaker-prompt')

  if (navigator && navigator.userAgent.includes('BeakerBrowser')) {
    beakerPrompts.forEach(function (el) {
      el.classList.add('hidden')
    })
  }
})