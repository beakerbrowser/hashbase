# Hypercloud ☁ 

Hypercloud is a public peer service for [Dat](https://datproject.org) archives. It provides a HTTP-accessible interface for creating an account and uploading Dats.

Features:

 - Simple Dat uploading and hosting
 - Easy to replicate Dats, Users, or entire datasets between Hypercloud deployments
 - Configurable user management
 - Easy to self-deploy

Links:

 - **[Get Involved](https://github.com/joehand/hypercloud/wiki)**
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
dir: ./.hypercloud          # where to store the data
brandname: Hypercloud       # the title of your service
hostname: hypercloud.local  # the hostname of your service
port: 8080                  # the port to run the service on
rateLimiting: true          # rate limit the HTTP requests?
```

#### Admin Account

The admin user has its credentials set by the config yaml at load. If you change the password while the server is running, then restart the server, the password will be reset to whatever is in the config.

```yaml
admin:
  email: 'foo@bar.com'
  password: myverysecretpassword
```

#### UI Module

The frontend can be replaced with a custom npm module. The default is [hypercloud-ui-vanilla](https://npm.im/hypercloud-ui-vanilla).

```yaml
ui: hypercloud-ui-vanilla
```

#### HTTP Sites

Hypercloud can host the archives as HTTP sites. This has the added benefit of enabling [dat-dns shortnames](npm.im/dat-dns) for the archives. There are two possible schemes:

```yaml
sites: per-user
```

Per-user will host archives at `username.hostname/archivename`, in a scheme similar to GitHub Pages. If the archive-name is == to the username, it will be hosted at `username.hostname`.

Note that, in this scheme, a DNS shortname is only provided for the user archive (`username.hostname`).

```yaml
sites: per-archive
```

Per-archive will host archives at `archivename.username.hostname`. If the archive-name is == to the username, it will be hosted at `username.hostname`.

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

Hypercloud uses Json Web Tokens to manage sessions. You absolutely *must* replace the `secret` with a random string before deployment.

```yaml
sessions:
  algorithm: HS256                # probably dont update this
  secret: THIS MUST BE REPLACED!  # put something random here
  expiresIn: 1h                   # how long do sessions live?
```

#### Jobs

Hypercloud runs some jobs periodically. You can configure how frequently they run.

```yaml
# processing jobs
jobs:
  popularArchivesIndex: 30s  # compute the index of archives sorted by num peers
  userQuotaUsage: 5m         # compute how much disk space each user is using
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