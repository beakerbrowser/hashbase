# Archives Schema

## Layout

 - `main`
   - `archives`: Map of `key => Archive object`.
   - `dead-archives`: Map of `key => undefined`. A listing of archives with no hosting users, and which need to be deleted.
   - `misc`: Various book-keeping, stores info such as the key of the changes feed. (hypercore-archiver)
   - `added-keys`: Keys of dats actively swarming. (hypercore-archiver)

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