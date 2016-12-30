if (+(/^v([\d]+)/.exec(process.version)[1]) < 6) {
  console.log('Detected node version <6, transpiling')
  try {
    require('babel-register')({ presets: ['es2015'] })
  } catch (e) {
    console.log('Call `npm run install-transpiler` first. You\'re on node <6, so we need extra deps.')
    process.exit(1)
  }
}
