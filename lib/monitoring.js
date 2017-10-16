const bytes = require('bytes')
const ms = require('ms')
const fs = require('fs')
const path = require('path')
const promisify = require('es6-promisify')
const getFolderSize = promisify(require('get-folder-size'))

const GB = bytes('1gb')

module.exports.init = function (config, cloud, pmx) {
  setupHDUsageMonitor(config, pmx)
  setupProfilerActions(config, pmx)
  pmx.action('compute-cohorts', async cb => {
    try {
      await cloud.usersDB.computeCohorts()
      cb({success: true}) // eslint-disable-line
    } catch (err) {
      cb({success: false, err}) // eslint-disable-line
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

function setupProfilerActions (config, pmx) {
  var isProfiling = false
  const profiler = require('v8-profiler')

  pmx.action('start-profiler', cb => {
    if (isProfiling) return
    isProfiling = true

    profiler.startProfiling('hashbase-profile')

    cb({success: true}) // eslint-disable-line
  })

  pmx.action('stop-profiler', cb => {
    if (!isProfiling) return
    isProfiling = false

    const profile = profiler.stopProfiling('hashbase-profile')
    profile.export()
      .pipe(fs.createWriteStream(path.join(__dirname, '../out.cpuprofile')))
      .on('finish', function () {
        profile.delete()
        profiler.deleteAllProfiles()
        cb({success: true}) // eslint-disable-line
      })
  })

  pmx.action('take-heap-snapshot', cb => {
    var snapshot = profiler.takeSnapshot('hashbase-heap-snapshot')
    snapshot.export()
      .pipe(fs.createWriteStream(path.join(__dirname, '../out.heapsnapshot')))
      .on('finish', () => {
        snapshot.delete()
        profiler.deleteAllSnapshots()
        cb({success: true}) // eslint-disable-line
      })
  })
}
