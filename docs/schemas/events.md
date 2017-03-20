## UsersDB

Emits:

```js
usersDB.on('create', (record) => {})
usersDB.on('put', (record) => {})
usersDB.on('del', (record) => {})
usersDB.on('add-archive', ({userId, archiveKey, name}, record) => {})
usersDB.on('remove-archive', ({userId, archiveKey}, record) => {})
```

## ArchivesDB

```js
archivesDB.emit('create', (record) => {})
archivesDB.emit('put', (record) => {})
archivesDB.emit('del', (record) => {})
archivesDB.emit('add-hosting-user', ({key, userId}, record) => {})
archivesDB.emit('remove-hosting-user', ({key, userId}, record) => {})
```