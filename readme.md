# Hypercloud: p2p + ☁ 

Massive multipeer online re-plicable goods.

Hypercloud is a "high-availability" server for peer to peer Dats. Hypercloud Dat archives are discoverable over both the Dat network and http. Hypercloud is also fully replicable! Hyperclouds can be backed up or seeded to other peers, duplicating up all of the contents in each cloud.

Hypercloud has a admin that adds new servers. Servers are for a single user or group - anyone with the key will push to that server. All files pushed to a server will be available over http and Dat at their original key.

In replication mode, users can replicate their whole server. The whole cloud (many servers) can also be backed up.

### Example

How does hypercloud work? Three steps!

1. The Institution will start by creating a server for Dr. Cloud, a researcher: `hypercloud add --name Dr-Cloud`. This will print out the Dr. Cloud's server info:
 
```
server started for Dr-Cloud:
  directory: /home/hypercloud/servers/274a30e4e59ef47a4f4dc360383011553947f5a7f8ac3d25a08e3ac066a811fc
  archiver: Dr-Cloud-b54e2c5cc0ee4320e4bda53c6dd1e49f
  http: 49308
```
2. The Institution will start their hypercloud: `hypercloud start`. This will start Dr. Clouds dat-publish server.
3. Dr. Cloud can then push a Dat to the server with dat-push: `dat-push Dr-Cloud-b54e2c5cc0ee4320e4bda53c6dd1e49f`.

Dr. Cloud's research files are now available over Dat and the http port!

#### Replication

What Dr. Cloud needed to backup all of their Dats?

1. The Institution would put the hypercloud into replication mode: `hypercloud replicate`.
2. Dr. Cloud can download the Dat: `dat 274a30e4e59ef47a4f4dc360383011553947f5a7f8ac3d25a08e3ac066a811fc backup_dir`. This will contain ALL of the Dats Dr. Cloud pushed.

What if the Institution needs to do a full hypercloud backup? 

1. Replication mode! `hypercloud replicate`. This will print the hypercloud key.
2. Backup mode! On another server run the backup: `hypercloud backup --key <cloud-key>` and a full backup of all servers (and the main hypercore feed) will be made.

### Cloud 

A cloud is a collection of servers and a hypercore feed to track the servers.

Each cloud can be fully replicated by replicating the hypercore feed and then each server contained in that feed. These commands are provided in hypercloud:

* On the cloud source, run: `hypercloud replicate`. This will print the `<cloud-key>`.
* On another server run: `hypercloud backup --key=<cloud-key>`

### Servers

A server a named dat-publish server. It runs a dat-archiver server + a hyperdrive-http. The server can act as a public dat peer and an http access point for the files. Dats are pushed to the server with dat-push.

Servers are a dat (containing other dats). They can be individually replicated, allowing a user to backup all dats they've pushed to a dat-archiver (not in current API).

## Usage

Make your own pretty clouds.

### Commands

* `hypercloud start`: start hypercloud and all existing dat-publish servers
* `hypercloud add --name <server-name>`: add a new server to your hypercloud. This will create a dat-archiver you can push to (archive-key will be printed out).
* `hypercloud replicate`: put hypercloud in replication mode. This will allow the whole cloud to be backed up, or individual servers to be downloadable over dat.
* `hypercloud backup --key <cloud-key>`: backup another hypercloud

#### General Options

* `--dir`: directory for servers
* `--db`: path to hypercloud db (relative to server dir)

## API


## License

MIT

## TODO:

* Support multiple clouds per `hypercloud` instance
* expose dat-publish options
* user can do server config? (set root archive, index page, etc.)
* share files to update metadata after each push (will speed replicate up)
* improve taglines

### Cheesy Taglines

* Like p2p but in the cloud.
* The cloud that is your best peer.
* centralize the decentralized.
* why have p2p when you could have a cloud?
* Hypercloud: a fancy name for a list of dat-publish servers.
* Put some of the server stuff back into dat-publish
* ???
