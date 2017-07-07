const bytes = require('bytes')
const ms = require('ms')
const promisify = require('es6-promisify')
const getFolderSize = promisify(require('get-folder-size'))

const GB = bytes('1gb')

module.exports.init = function (config, cloud, pmx) {
  setupHDUsageMonitor(config, pmx)
  pmx.action('compute-cohorts', async cb => {
    try {
      await cloud.usersDB.computeCohorts()
      cb({success: true})
    } catch (err) {
      cb({success: false, err})
    }
  })
}

function setupHDUsageMonitor (config, pmx) {
  var probe = pmx.probe()
  var metric = probe.metric({
    name: 'Disk Usage',
    alert: {
      mode: 'threshold',
      value: bytes(config.alerts.diskUsage || '10gb') / GB,
      msg: `Detected over ${config.alerts.diskUsage} disk usage`
    }
  })

  read()
  setInterval(read, ms('15m'))
  async function read () {
    var du = await getFolderSize(config.dir)
    metric.set(du / GB)
  }
}
