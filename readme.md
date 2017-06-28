# Hashbase

Hashbase is a public peer service for [Dat](https://datproject.org) archives. It provides a HTTP-accessible interface for creating an account and uploading Dats. It was created to power a content-community for the [Beaker Browser](https://beakerbrowser.com)

Links:

 - **[Hashbase.io](https://hashbase.io)**
 - **[Documentation](./docs)**

## Setup

Clone this repository, then run

```
npm install
cp config.defaults.yml config.development.yml
```

Modify `config.development.yml` to fit your needs, then start the server with `npm start`.

## Configuration

Before deploying the service, you absolutely *must* modify the following config.

#### Basics

```yaml
dir: ./.hashbase              # where to store the data
brandname: Hashbase           # the title of your service
hostname: hashbase.local      # the hostname of your service
port: 8080                    # the port to run the service on
rateLimiting: true            # rate limit the HTTP requests?
csrf: true                    # use csrf tokens?
defaultDiskUsageLimit: 100mb  # default maximum disk usage for each user
pm2: false                    # set to true if you're using https://keymetrics.io/
```

#### Lets Encrypt

You can enable lets-encrypt to automatically provision TLS certs using this config:

```yaml
letsencrypt:
  debug: false          # debug mode? must be set to 'false' to use live config
  email: 'foo@bar.com'  # email to register domains under
```

If enabled, `port` will be ignored and the server will register at ports 80 and 443.

#### Admin Account

The admin user has its credentials set by the config yaml at load. If you change the password while the server is running, then restart the server, the password will be reset to whatever is in the config.

```yaml
admin:
  email: 'foo@bar.com'
  password: myverysecretpassword
```

#### HTTP Sites

Hashbase can host the archives as HTTP sites. This has the added benefit of enabling [dat-dns shortnames](https://npm.im/dat-dns) for the archives. There are two possible schemes:

```yaml
sites: per-user
```

Per-user will host archives at `username.hostname/archivename`, in a scheme similar to GitHub Pages. If the archive-name is == to the username, it will be hosted at `username.hostname`.

Note that, in this scheme, a DNS shortname is only provided for the user archive (`username.hostname`).

```yaml
sites: per-archive
```

Per-archive will host archives at `archivename-username.hostname`. If the archive-name is == to the username, it will be hosted at `username.hostname`.

By default, HTTP Sites are disabled.

#### Closed Registration

For a private instance, use closed registration with a whitelist of allowed emails:

```yaml
registration:
  open: false
  allowed:
    - alice@mail.com
    - bob@mail.com
```

#### Reserved Usernames

Use reserved usernames to blacklist usernames which collide with frontend routes, or which might be used maliciously.

```yaml
registration:
  reservedNames:
    - admin
    - root
    - support
    - noreply
    - users
    - archives
```

#### Session Tokens

Hashbase uses Json Web Tokens to manage sessions. You absolutely *must* replace the `secret` with a random string before deployment.

```yaml
sessions:
  algorithm: HS256                # probably dont update this
  secret: THIS MUST BE REPLACED!  # put something random here
  expiresIn: 1h                   # how long do sessions live?
```

#### Jobs

Hashbase runs some jobs periodically. You can configure how frequently they run.

```yaml
# processing jobs
jobs:
  popularArchivesIndex: 30s  # compute the index of archives sorted by num peers
  userDiskUsage: 5m          # compute how much disk space each user is using
  deleteDeadArchives: 5m     # delete removed archives from disk
```

#### Emailer

*Todo, sorry*

## Tests

Run the tests with

```
npm test
```

To run the tests against a running server, specify the env var:

```
REMOTE_URL=http://{hostname}/ npm test
```

## License

MIT
