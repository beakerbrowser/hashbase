# Docs

 - [Contributing Guidelines](../CONTRIBUTING.md)

### APIs

 - [Web API](./webapis.md). Complete description of all endpoints.

### Flows

 - [Registration Flow](./flows/registration.md). User-registration and verification.
 - [Dat Ownership Proof Flow](./flows/dat-ownership-proof.md). How ownership of a dat by a specific user is verified.

### Components

 - [Jobs](./components/jobs.md). Behaviors that either get triggered by a message, or auto-triggered by the scheduler.
 - [Triggers](./components/triggers.md). Any file-indexing is handled by Triggers, which watch for changes to specific paths and archives, then queue jobs automatically when a change is detected.
 - [Locks](./components/locks.md). Locks are used internally to create regions of async code that will only be entered one at a time.

### Schemas

 - [Access Scopes](./schemas/access-scopes.md). The different permissions available to users.
 - [Archives Schema](./schemas/archives.md). Archive record layout and objects.
 - [Users Schema](./schemas/users.md). User record layout and objects.
