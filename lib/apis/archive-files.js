const {NotFoundError} = require('../const')
const pda = require('pauls-dat-api')
const prettyBytes = require('pretty-bytes')
const {pluralize, makeSafe, identifyStream} = require('../helpers')

const CSP = `
default-src 'self' dat:;
script-src 'self' 'unsafe-eval' 'unsafe-inline' dat:;
style-src 'self' 'unsafe-inline' dat:;
img-src 'self' data: dat:;
object-src 'none';
`.replace(/\n/g, ' ')

// exported api
// =

module.exports = class ArchiveFilesAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.usersDB = cloud.usersDB
    this.archivesDB = cloud.archivesDB
    this.archiver = cloud.archiver
    this.getArchive = cloud.getArchive.bind(cloud)
  }

  async _getArchiveRecord (req, {topLevel} = {}) {
    var username, archname, userRecord, archiveRecord
    const findFn = test => a => a.name.toLowerCase() === test

    if (this.config.sites === 'per-archive') {
      if (!req.vhost[1]) {
        // user.domain
        username = archname = req.vhost[0]
      } else {
        // archive.user.domain
        archname = req.vhost[0]
        username = req.vhost[1]
      }

      // lookup user record
      userRecord = await this.usersDB.getByUsername(username)
      if (!userRecord) throw new NotFoundError()

      // lookup archive record
      archiveRecord = userRecord.archives.find(findFn(archname))
      if (!archiveRecord) throw new NotFoundError()
      return archiveRecord
    } else {
      // user.domain/archive
      username = req.vhost[0]
      archname = req.path.split('/')[1]

      // lookup user record
      userRecord = await this.usersDB.getByUsername(username)
      if (!userRecord) throw new NotFoundError()

      if (!topLevel && archname) {
        // lookup archive record
        archiveRecord = userRecord.archives.find(findFn(archname))
        if (archiveRecord) {
          archiveRecord.isNotToplevel = true
          return archiveRecord
        }
      }

      // look up archive record at username
      archiveRecord = userRecord.archives.find(findFn(username))
      if (!archiveRecord) throw new NotFoundError()
      return archiveRecord
    }
  }

  async getDNSFile (req, res) {
    // get the archive record
    var archiveRecord = await this._getArchiveRecord(req, {topLevel: true})

    // respond
    res.status(200).end('dat://' + archiveRecord.key + '/\nTTL=3600')
  }

  async getFile (req, res) {
    var fileReadStream
    var headersSent = false
    var archiveRecord = await this._getArchiveRecord(req)

    // skip the archivename if the archive was not found by subdomain
    var reqPath = archiveRecord.isNotToplevel ? req.path.split('/').slice(2).join('/') : req.path

    // track whether the request has been aborted by client
    // if, after some async, we find `aborted == true`, then we just stop
    var aborted = false
    req.once('aborted', () => {
      aborted = true
    })

    // get the archive
    var archive = await this.getArchive(archiveRecord.key)
    if (!archive) {
      throw NotFoundError()
    }
    if (aborted) return

    // open the archive
    await new Promise((resolve, reject) => archive.open(err => {
      if (err) reject(err)
      else resolve()
    }))
    if (aborted) return

    // lookup entry
    var hasExactMatch = false // if there's ever an exact match, then dont look for near-matches
    var filepath = reqPath
    if (!filepath) filepath = '/'
    var isFolder = filepath.endsWith('/')
    const checkMatch = (entry, name) => {
      if (isFolder) {
        // look for index.html
        return (name.toLowerCase() === filepath + 'index.html')
      }
      // check exact match
      if (name === filepath) {
        hasExactMatch = true
        return true
      }
      // check inexact matches
      if (!hasExactMatch) {
        // try appending .html
        if (name === filepath + '.html') return true
        // try appending .htm
        if (name === filepath + '.htm') return true
      }
    }
    var entry = await pda.lookupEntry(archive, checkMatch)
    if (aborted) return

    // not found
    if (!entry) {
      if (!isFolder) {
        throw new NotFoundError()
      }

      // if we're looking for a directory, render the file listing
      res.writeHead(200, 'OK', {
        'Content-Type': 'text/html',
        'Content-Security-Policy': CSP
      })
      return directoryListingPage(archive, reqPath, html => res.end(html))
    }

    // caching if-match
    const ETag = 'block-' + entry.content.blockOffset
    if (req.headers['if-none-match'] === ETag) {
      return res.status(304).end()
    }

    // fetch the entry and stream the response
    fileReadStream = archive.createFileReadStream(entry)
    fileReadStream
      .pipe(identifyStream(entry.name, mimeType => {
        // send headers, now that we can identify the data
        headersSent = true
        var headers = {
          'Content-Type': mimeType,
          'Content-Security-Policy': CSP,
          'Cache-Control': 'public, max-age: 60',
          ETag
        }
        if (entry.length) headers['Content-Length'] = entry.length
        res.writeHead(200, 'OK', headers)
      }))
      .pipe(res)

    // handle empty files
    fileReadStream.once('end', () => {
      if (!headersSent) {
        res.writeHead(200, 'OK', {
          'Content-Security-Policy': CSP
        })
        res.end('\n')
        // TODO
        // for some reason, sending an empty end is not closing the request
        // this may be an issue in beaker's interpretation of the page-load ?
        // but Im solving it here for now, with a '\n'
        // -prf
      }
    })

    // handle read-stream errors
    fileReadStream.once('error', _ => {
      if (!headersSent) {
        res.status(500).send('Failed to read file')
      }
    })

    // abort if the client aborts
    req.once('aborted', () => {
      if (fileReadStream) {
        fileReadStream.destroy()
      }
    })
  }
}

const directoryListingPageStyles = `<style>
  .entry {
    background: no-repeat center left;
    padding: 3px 20px;
    font-family: monospace;
  }
  .updog {
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAKxJREFUeNpi/P//PwMlgImBQjAMDGBBF2BkZISz09LSwCE8a9YsuCBGoIMEkDEMJCUl/b90+QoYg9i41LNgc1ZycvL/hMQkhgcPH4H5iUnJIJf9nzt3LiNBL2RkZPwPj4hk4BMUYuDh44MEFDMLQ0xsHAMrKyvIJYyEwuDLiuXLeP7+/Qv3EihcmJmZGZiYmL5gqEcPFKBiAyDFjCPQ/wLVX8BrwGhSJh0ABBgAsetR5KBfw9EAAAAASUVORK5CYII=');
  }
  .directory {
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAAXdEVYdEF1dGhvcgBMYXBvIENhbGFtYW5kcmVp35EaKgAAACl0RVh0RGVzY3JpcHRpb24AQmFzZWQgb2YgSmFrdWIgU3RlaW5lciBkZXNpZ26ghAVzAAABbElEQVQ4jaWQO0tDQRCFz2x2A8YHQoogaKFW2qSysbATsdAIWgrWlhIFBRvLoFhZW/gb0vgPRBAStEgExZA2VR7X3Nw7MxY3BhUjCU6zMOz5zrcL/HPo/HDzREFnZMj1tgoI1FPm/ePL/M2fgNxRxltaXh8xxkCEoSIQYQQdH6XHO6/T8ZePL/PFfgBLCifCqJQfesswDNBoNhAEnQQRFXLZjV+qAefiRQsAba/e27MIWl4Ta1t7SE3N9lVXEVxfnaYtyJjS0z04DCMlF8fK6jaSyRQatUpfwFhypvsEUrOze4CxiUmoAlBF4LfwXq/1DUcG3UJhRmJ0HI1a9c/AzxGOAAYApEsbCiBfAMrDA5T5nwb8zYCHN/j8RABQFYAINGgYgEhUamPGKLOQiyciCFH3NABRdFsFqhoVqUJV4bebiBmjNmZd8eW5kJ6bXxhUAADw9lpWY12BLrKZRWNjt0EYTA8DsM5Vw7a/9gEhN65EVGzVRQAAAABJRU5ErkJggg==');
  }
  .file {
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAASdEVYdFRpdGxlAFBhcGVyIFNoZWV0c7mvkfkAAAAXdEVYdEF1dGhvcgBMYXBvIENhbGFtYW5kcmVp35EaKgAAACd0RVh0RGVzY3JpcHRpb24Ad2l0aCBhIEhVR0UgaGVscCBmcm9tIEpha3VihlQHswAAAhNJREFUOI11kstqU1EUhr91ctI2A2uTNsRaOxDEkeILiIgTL6CCAx+iUnTSgQPBRxAFSxWhA8XiBQst7aQjUV+kMWlzOaeJVZvsy3JwctK0wQWLvQabb/3/v7eoKuubqzdFZMk5PwuKqqIKoAB/Qba8d8/v3b2/xfFSVVbXPpWbUUO990Pd7Xa0Uv2paxurf1Y+vnucwA87AOh0OjP5iQL7v/dptWOacZ1ao0plZ5vdepV2q8Wt67dzxanik7fvlxcGBQQAxlgAqpUK5e0KO5Ua9d2IuNlmL/pFuVwhCAKuXrmWGx0Ze/pm+dXlFBAmAANAYSqPcy5p73DO4pwjE8OHzyuMZXNcvHAp9/3H1wXgWx9gjQGURi3CWjuU01S+xMkTBbxYgiCQg4ODGy9ePsvMzz1yfQUKTBTGcc7iVVHv8T5V4hhhFJExzp09z8bmesarzwIpINkaN1s454YUpCWBkC706gcysEkG+clxnPNo7y/0PsMhQHoAa1CvwyFCQBAoipBcFY4eyWCtxTt/FCBAHO3h7P8tZMIMpeI0xlh8z+pABkLpVBG0J1UGVKQKVBARrDH9rAaeERq1iG63298YhiFnZmf63rWXiTEGd9wCwOmZaUTkaA8ooJfpEEBEqnEcTRcKk//1n1a73QIkMtZ0EluqzD98cCfMhoum2y2pgpI84fEZlGx2pG6MmVtafP0F4B+wR1eZMTEGTgAAAABJRU5ErkJggg==');
  }
</style>`

function directoryListingPage (archive, path, cb) {
  pda.listFiles(archive, path, (_, entries) => {
    // sort the listing
    var names = Object.keys(entries).sort((a, b) => {
      var ea = entries[a]
      var eb = entries[b]
      // directories on top
      if (ea.type === 'directory' && eb.type !== 'directory') return -1
      if (ea.type !== 'directory' && eb.type === 'directory') return 1
      // alphabetical after that
      return a.localeCompare(b)
    })
    // show the updog if path is not top
    var updog = ''
    if (path !== '/' && path !== '') {
      updog = `<div class="entry updog"><a href="..">..</a></div>`
    }
    // entries
    var totalBytes = 0
    var entryEls = names.map(name => {
      var entry = entries[name]
      totalBytes += entry.length
      var url = makeSafe(entry.name)
      if (!url.startsWith('/')) url = '/' + url // all urls should have a leading slash
      if (entry.type === 'directory' && !url.endsWith('/')) url += '/' // all dirs should have a trailing slash
      return `<div class="entry ${makeSafe(entry.type)}"><a href="${url}">${makeSafe(name)}</a></div>`
    }).join('')
    // summary
    var summary = `<div class="entry">${names.length} ${pluralize(names.length, 'file')}, ${prettyBytes(totalBytes || 0)}</div>`
    // render
    cb('<meta charset="UTF-8">' + directoryListingPageStyles + updog + entryEls + summary)
  })
}
