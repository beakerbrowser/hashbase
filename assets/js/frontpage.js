/* global $ */

// tabbed archives list js
$(function () {
  var viewButtons = $('.archives-view-link')
  var views = $('.archives-view')

  viewButtons.click(function (e) {
    viewButtons.removeClass('active')
    views.removeClass('active')

    $(e.target).addClass('active')
    $(e.target.dataset.view).addClass('active')
  })
})
