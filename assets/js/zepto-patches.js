{
  // monkey-patch $.post so that it always sends JSON
  function parseArguments (url, data, success, dataType) {
    if ($.isFunction(data)) dataType = success, success = data, data = undefined
    if (!$.isFunction(success)) dataType = success, success = undefined
    return {
      url: url,
      data: data,
      success: success,
      dataType: dataType
    }
  }
  $.post = function (/* url, data, success, dataType */) {
    var options = parseArguments.apply(null, arguments)
    options.type = 'POST'
    if (options.data) {
      if (typeof options.data !== 'string') {
        options.data = JSON.stringify(options.data)
      }
      options.contentType = 'application/json'
    }
    return $.ajax(options)
  }
}
