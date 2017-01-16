# Jobs Component

Jobs are behaviors that either get triggered by a message, or auto-triggered by the scheduler.

## Jobs API

The jobs manager is an event broker. When it comes time to scale horizontally, it will be internally rewritten to use RabbitMQ.

```js
jobs.queue(name[, data])          // add a one-time job
jobs.requeue(job)                 // remove, then re-add the job to the queue
jobs.markDone(job)                // remove the job from the queue
jobs.addHandler(name, job => ...) // add a handler for the job
jobs.removeHandler(handlerId)     // remove a handler
```

Example of setting up jobs:

```js
jobs.queue('verify-profile-dat', { userId: '...', url: '...' })
jobs.queue('clean-unverified-users')
```

Example of handling jobs:

```js
var { hostname } = config
jobs.addHandler('verify-profile-dat', job => {
  var { userId, url } = job.data
  readDatFile(`${url}/proofs/${hostname}`, (err, data) => {
    // ...
    jobs.markDone(job)
  })
})
```

## Scheduler API

The scheduler adds cron-style timers/intervals to queue jobs at certain times.

```js
scheduler.add(name, when[, data]) // schedule a job (cron syntax)
scheduler.list([name])            // list active jobs
scheduler.remove(scheduleId)      // remove a scheduled job
```

Example of scheduling jobs:

```js
// should be run during app startup
scheduler.add('clean-unverified-users', '0 0 0 * * *')  // run at midnight every day
```

## Jobs

### Verify Profile Dat

 - Name: `verify-profile-dat'
 - Task: Read the proof file in the profile, verify the proof, and update the user record.
 - Data:
   - `userId`: ID of the account that is attached to the profile
   - `url`: URL of the profile-dat
 - Preconditions:
   - User account should have its email verified
   - Profile-dat and the proof-file should be locally available

### Dead Archive Cleanup

 - Name: `clean-dead-archives`
 - Task: Deletes any archives referenced in [`dead-archives`](https://github.com/joehand/hypercloud/wiki/Archives-Schema#layout) (no hosting users).

### Unverified User Cleanup

 - Name: `clean-unverified-users`
 - Task: Deletes any user records older than a day with `isEmailVerified==false`