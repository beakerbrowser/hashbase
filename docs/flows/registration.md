# User Registration Flow

## Step 1. Register (POST /v2/accounts/register)

User POSTS to `/v2/accounts/register` with body:

```
{
  email: String
  username: String
  password: String
}
```

Server creates a new account for the user. A random 32-byte email-verification nonce is created. The user record indicates:

scopes|isEmailVerified|emailVerifyNonce
------|---------------|----------------
none|false|XXX

Server sends an email to the user with the `emailVerifyNonce`. 

Server responds 200 with HTML/JSON indicating to check email.

## Step 2. Verify (GET or POST /v2/accounts/verify)

User GETS or POSTS `/v2/accounts/verify` with query-params or body:

```
{
  username: String, username of the account
  nonce: String, verification nonce
}
```

Server updates user record to indicate:

scopes|isEmailVerified|emailVerifyNonce
------|---------------|----------------
user|true|null

Sever generates session JWT and responds 200 with auth=token.