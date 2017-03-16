# Web APIs Overview

Service APIs

```
GET / - front page
GET /:username - get a user's profile
GET /:username/:datname - get info about a user's dat
GET /v1/explore - get info about activity on the server
```

Archive APIs

```
GET /:archiveKey
POST /v1/archives/add
POST /v1/archives/remove
```

User APIs

```
POST /v1/register
POST /v1/verify
POST /v1/login
POST /v1/logout
GET  /v1/account - get my info & settings
POST /v1/account - update my settings
```

Admin APIs

```
GET  /v1/admin/users - query users
GET  /v1/admin/users/:id - get user info & settings
POST /v1/admin/users/:id - update user settings
POST /v1/admin/users/:id/suspend - suspend a user account
POST /v1/admin/users/:id/unsuspend - unsuspend a user account
```

## Service APIs

### GET /

Home page.

Response (html): TODO

### GET /:username

Lookup user profile.

Response (json):

```
{
  username: String, from user's account object
  createdAt: Number, the timestamp of creation time
}
```

Response (html): TODO

Response (json) when `?view=dats`:

```
{
  dats: [{
    key: String, dat key
    name: String, optional shortname assigned by the user
    title: String, optional title extracted from the dat's manifest file
    description: String, optional description extracted from the dat's manifest file
  }]
}
```

Response (html) when `?view=dats`: TODO

### GET /:username/:datname

Lookup archive info. `datname` can be the user-specified shortname, or the dat key.

Response (json):

```
{
  user: String, the owning user's name
  key: String, the key of the dat
  name: String, optional shortname assigned by the user
  title: String, optional title extracted from the dat's manifest file
  description: String, optional description extracted from the dat's manifest file
}
```

Response (html): TODO

### GET /v1/explore

Response body (json) when `?view=activity`:

```
{
  activity: [{
    key: String, event's id
    userid: String, the user who made the change
    username: String, the name of the user who made the change
    action: String, the label for the action
    params: Object, a set of arbitrary KVs relevant to the action
  }, ...]
}
```

Additional query params when `?view=activity`:
 
 - start: For pagination. The key of the event to start after.

## Archive APIs

### GET /:archiveKey

Response (json) when `?view=status`:

```
{
  progress: Number, a percentage (from 0 to 1) of upload progress
}
```

### POST /v1/archives/add

Request body (json). Can supply `key` or `url`:

```
{
  key: String
  url: String
  name: String, optional shortname for the dat
}
```

Adds the archive to the user's account. If the archive already exists, the request will update the settings (eg the name).

### POST /v1/archives/remove

Request body (json). Can supply `key` or `url`:

```
{
  key: String
  url: String
}
```

Removes the archive from the user's account. If no users are hosting the archive anymore, the archive will be deleted.

## User APIs

### POST /v1/login

Request body (json). All fields required:

```
{
  email: String
  password: String
}
```

Generates a session JWT and provides it in response headers.

### POST /v1/register

[Step 1 of the register flow](https://github.com/joehand/hypercloud/wiki/Registration-Flow#step-1-register-post-v1register)

Request body (json). All fields required:

```
{
  email: String
  username: String
  password: String
}
```

### POST /v1/verify

[Step 2 of the register flow](https://github.com/joehand/hypercloud/wiki/Registration-Flow#step-2-verify-post-v1verify)

Request body (json). All fields required:

```
{
  username: String, username of the account
  nonce: String, verification nonce
}
```

Like `/v1/login`, generates a session JWT and provides it in response headers.

### GET /v1/account

Responds with the authenticated user's [account object](https://github.com/joehand/hypercloud/wiki/Users-Schema#account-object).

Response body (json):

```
{
  email: String, the user's email address
  username: String, the chosen username
}
```

### POST /v1/account

Updates the authenticated user's [account object](https://github.com/joehand/hypercloud/wiki/Users-Schema#account-object)

Request body (json):

All fields are optional. If a field is omitted, no change is made.

```
{
  username: String, the chosen username
}
```

## Admin APIs

### GET /v1/admin/users

Run queries against the users DB.

Query params:

 - `?sort=`. Values: `createdBy` `email`

Response body (json):

```
{
  users: [{
    email: String, the user's email address
    username: String, the chosen username
    isEmailVerified: Boolean
    scopes: Array of strings, what is this user's perms?
    updatedAt: Number, the timestamp of the last update
    createdAt: Number, the timestamp of creation time
  }, ...]
}
```

Scope: `admin:users`

### GET /v1/admin/users/:id

Response body (json):

```
{
  email: String, the user's email address
  username: String, the chosen username
  isEmailVerified: Boolean
  emailVerifyNonce: String, the random verification nonce
  scopes: Array of strings, what is this user's perms?
  updatedAt: Number, the timestamp of the last update
  createdAt: Number, the timestamp of creation time
}
```

Scope: `admin:users`

### POST /v1/admin/users/:id

Request body (json):

All fields are optional. If a field is omitted, no change is made.

```
{
  email: String, the user's email address
  username: String, the chosen username
  scopes: Array of strings, what is this user's perms?
}
```

Scope: `admin:users`

### POST /v1/admin/users/:id/suspend

Scope: `admin:users`

### POST /v1/admin/users/:id/unsuspend

Scope: `admin:users`