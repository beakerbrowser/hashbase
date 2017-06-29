const bytes = require('bytes')
const ms = require('ms')
const promisify = require('es6-promisify')
const getFolderSize = promisify(require('get-folder-size'))

module.exports.init = function (config, pmx) {
  setupHDUsageMonitor(config, pmx)
}

function setupHDUsageMonitor (config, pmx) {
  var probe = pmx.probe()
  var metric = probe.metric({
    name: 'Disk Usage',
    alert: {
      mode: 'threshold',
      value: bytes(config.alerts.diskUsage || '10gb'),
      msg: `Detected over ${config.alerts.diskUsage} disk usage`
    }
  })

  read()
  setInterval(read, ms('15m'))
  async function read () {
    var du = await getFolderSize(config.dir)
    metric.set(du)
  }
}
