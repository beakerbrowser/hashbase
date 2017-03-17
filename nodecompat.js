var vMajor = +(/^v([\d]+)/.exec(process.version)[1])
if (vMajor < 6) {
  console.log('Detected node version <6, transpiling es2015 features')
  try {
    require('babel-register')({ presets: ['es2015', 'transform-async-to-generator'] })
  } catch (e) {
    console.log('Call `npm run install-transpiler` first. You\'re on node <6, so we need extra deps.')
    process.exit(1)
  }
} else if (vMajor === 6) {
  console.log('Detected node version 6, transpiling async to generators')
  require('babel-register')({ plugins: ['transform-async-to-generator'] })
}
