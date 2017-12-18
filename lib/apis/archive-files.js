const {NotFoundError} = require('../const')
const pda = require('pauls-dat-api')
const parseRange = require('range-parser')
const {identifyStream} = require('../helpers')
const directoryListingPage = require('../templates/directory-listing-page')

// exported api
// =

module.exports = class ArchiveFilesAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.usersDB = cloud.usersDB
    this.archivesDB = cloud.archivesDB
    this.archiver = cloud.archiver
  }

  async _getArchiveRecord (req, {topLevel} = {}) {
    var username, archname, userRecord, archiveRecord
    const findFn = test => a => a.name.toLowerCase() === test

    if (this.config.sites === 'per-archive') {
      let vhostParts = req.vhost[0].split('-')
      if (vhostParts.length === 1) {
        // user.domain
        username = archname = vhostParts[0]
      } else {
        // archive-user.domain
        archname = vhostParts.slice(0, -1).join('-')
        username = vhostParts[vhostParts.length - 1]
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
    var archive = await this.archiver.loadArchive(archiveRecord.key)
    if (!archive) {
      throw NotFoundError()
    }
    if (aborted) return

    // find an entry
    var filepath = decodeURIComponent(reqPath)
    if (!filepath) filepath = '/'
    var isFolder = filepath.endsWith('/')
    var entry
    const tryStat = async (path) => {
      if (entry) return
      try {
        entry = await pda.stat(archive, path)
        entry.path = path
      } catch (e) {}
    }
    // detect if this is a folder without a trailing slash
    if (!isFolder) {
      await tryStat(filepath)
      if (entry && entry.isDirectory()) {
        filepath = filepath + '/'
        isFolder = true
      }
    }
    entry = false
    // do actual lookup
    if (isFolder) {
      await tryStat(filepath + 'index.html')
      await tryStat(filepath)
    } else {
      await tryStat(filepath)
      await tryStat(filepath + '.html') // fallback to .html
    }
    if (aborted) return

    // handle folder
    if (entry && entry.isDirectory()) {
      res.writeHead(200, 'OK', {
        'Content-Type': 'text/html'
      })
      return res.end(await directoryListingPage(archive, filepath, manifest && manifest.web_root))
    }

    // handle not found
    if (!entry) {
      throw new NotFoundError()
    }
    // add CORS per https://github.com/beakerbrowser/hashbase/issues/43
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')

    // handle range
    var statusCode = 200
    res.setHeader('Accept-Ranges', 'bytes')
    var range = req.headers.range && parseRange(entry.size, req.headers.range)
    if (range && range.type === 'bytes') {
      range = range[0] // only handle first range given
      statusCode = 206
      res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + entry.size)
      res.setHeader('Content-Length', range.end - range.start + 1)
    } else {
      if (entry.size) {
        res.setHeader('Content-Length', entry.size)
      }
    }

    // caching if-match (not if range is used)
    const ETag = 'block-' + entry.offset
    if (statusCode === 200 && req.headers['if-none-match'] === ETag) {
      return res.status(304).end()
    }

    // fetch the entry and stream the response
    fileReadStream = archive.createReadStream(entry.path, range)
    fileReadStream
      .pipe(identifyStream(entry.path, mimeType => {
        // send headers, now that we can identify the data
        headersSent = true
        var headers = {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age: 60',
          ETag
        }
        res.writeHead(statusCode, 'OK', headers)
      }))
      .pipe(res)

    // handle empty files
    fileReadStream.once('end', () => {
      if (!headersSent) {
        // no content
        headersSent = true
        res.writeHead(200, 'OK')
        res.end('\n')
      }
    })

    // handle read-stream errors
    fileReadStream.once('error', _ => {
      if (!headersSent) {
        headersSent = true
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
