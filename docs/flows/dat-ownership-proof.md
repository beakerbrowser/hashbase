# Dat Ownership Proof Flow

This describes a process for asserting ownership of a Dat by writing a pre-defined payload, then syncing the dat to hypercloud.

> This spec was originally part of the registration flow. It's now being preserved, as a general-purpose flow, until we have a deployment plan for it.

## Step 1. Claim ownership (POST /v1/dats/claim)

User POSTS `/v1/dats/claim` while authenticated with body (JSON):

```
{
  key: String, they key of the dat, or
  url: String, the url of the dat
}
```

Server generates the `proof` (a non-expiring JWT) with the following content:

```
{
  id: String, id of the user
  url: String, the URL of the dat
}
```

Server responds 200 with the body:

```
{
  proof: String, the encoded JWT
  hostname: String, the hostname of this service
}
```

## Step 2. Write proof

User writes the `proof` to the `/proofs/:hostname` file of their profile dat. User then syncs the updated dat to the service.

User GETS `/:key?view=proofs` periodically to watch for successful sync.

## Step 3. Validate claim

Server receives proof-file in the dat. After checking the JWT signature, the server updates archive record to indicate the verified ownership.