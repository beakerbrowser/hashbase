/* global $ EventSource */

// upload progress bar
$(function () {
  var progressBarContainer = $('.progress-bar-container')
  var progressBar = progressBarContainer.find('.progress-bar')
  var progressInner = progressBar.find('.progress')
  var label = progressBarContainer.find('.label')
  var key = progressBar.data('key')

  onProgress(window.params.progress)

  var events = new EventSource('/v2/archives/item/' + key + '?view=status')
  events.addEventListener('message', function (e) {
    onProgress((+e.data * 100) | 0)
  })

  function onProgress (progress) {
    progressBar.attr('aria-valuenow', progress)
    progressInner.attr('style', 'width: ' + progress + '%')
    label.find('span').html(progress + '%')
    if (progress < 100) {
      label.find('i').show()
    } else {
      label.find('i').hide()
    }
  }
})
