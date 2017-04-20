# Level Database Schema

Layout and schemas of the data in the LevelDB.

## Layout

 - `main`
   - `archives`: Map of `key => Archive object`.
   - `accounts`: Map of `id => Account object`.
   - `accounts-index`: Index of `username => id`, `email => id`, `profileUrl => id`.
   - `global-activity`: Map of `timestamp => Event object`.
   - `dead-archives`: Map of `key => undefined`. A listing of archives with no hosting users, and which need to be deleted.

## Archive object

Schema:

```
{
  key: String, the archive key

  hostingUsers: Array(String), list of user-ids hosting the archive

  updatedAt: Number, the timestamp of the last update
  createdAt: Number, the timestamp of creation time
}
```

## Account object

Schema:

```
{
  id: String, the assigned id
  username: String, the chosen username
  passwordHash: String, hashed password
  passwordSalt: String, salt used on hashed password

  email: String
  profileURL: String, the url of the profile dat
  archives: [{
    key: String, uploaded archive's key
    name: String, optional shortname for the archive
  }, ..]
  scopes: Array(String), the user's access scopes
  suspension: String, if suspended, will be set to an explanation
  updatedAt: Number, the timestamp of the last update
  createdAt: Number, the timestamp of creation time
  
  isEmailVerified: Boolean
  emailVerifyNonce: String, the random verification nonce (register flow)

  forgotPasswordNonce: String, the random verification nonce (forgot password flow)

  isProfileDatVerified: Boolean
  profileVerifyToken: String, the profile verification token (stored so the user can refetch it)
}
```

## Event object

Schema:

```
{
  ts: Number, the timestamp of the event
  userid: String, the user who made the change
  username: String, the name of the user who made the change
  action: String, the label for the action
  params: Object, a set of arbitrary KVs relevant to the action
}
```