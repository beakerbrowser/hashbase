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
```

#### Admin Account

The admin user has its credentials set by the config yaml at load. If you change the password while the server is running, then restart the server, the password will be reset to whatever is in the config.

```yaml
admin:
  email: 'foo@bar.com'
  password: myverysecretpassword
```

#### Session Tokens

Hypercloud uses Json Web Tokens to manage sessions. You absolutely *must* replace the `secret` with a random string before deployment.

```yaml
sessions:
  algorithm: HS256                # probably dont update this
  secret: THIS MUST BE REPLACED!  # put something random here
  expiresIn: 1h                   # how long do sessions live?
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