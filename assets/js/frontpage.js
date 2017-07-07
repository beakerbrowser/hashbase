/* global $ */

// tabbed archives list js
$(function () {
  var viewButtons = $('.archives-view-link')
  var views = $('.archives-view')

  $('#dismiss-get-started-btn').click(function (e) {
    $('#get-started-container')[0].style.display = 'none'
  })

  $('#dismiss-beaker-prompt-btn').click(function (e) {
    $('#beaker-prompt-frontpage')[0].style.display = 'none'

    // post to api
    var xhr = $.post('/v1/dismiss-beaker-prompt', {_csrf: $('[name="csrf"]').val()})
  })

  viewButtons.click(function (e) {
    viewButtons.removeClass('active')
    views.removeClass('active')

    $(e.target).addClass('active')
    $(e.target.dataset.view).addClass('active')
  })
})
