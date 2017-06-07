/* global $ */

// nav js
$(function () {
  var dropdownMenu = $('.nav .dropdown-menu')
  var dropdownMenuToggle = $('.nav .dropdown-menu-link')
  var mobileNav = $('.mobile-nav')
  var mobileNavToggle = $('.mobile-nav-toggle')

  function toggleMenu () {
    dropdownMenu.toggleClass('open')

    if (dropdownMenu.hasClass('open')) {
      $(document.body).on('click', toggleMenu)
    } else {
      $(document.body).off('click', toggleMenu)
    }
  }

  dropdownMenuToggle.click(function (e) {
    e.stopPropagation()
    toggleMenu()
  })

  mobileNavToggle.click(function () {
    mobileNav.toggleClass('open')
  })
})
