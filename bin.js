require('./nodecompat')
var config = require('./config')
var createApp = require('./index')

var app = createApp(config)
app.listen(config.port, () => {
  console.log(`server started on http://127.0.0.1:${config.port}`)
})
