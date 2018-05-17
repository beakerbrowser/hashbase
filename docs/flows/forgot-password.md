# Forgot Password Flow

## Step 1. Trigger flow (POST /v2/accounts/forgot-password)

User POSTS to `/v2/accounts/forgot-password` with body:

```
{
  email: String
}
```

A random 32-byte email-verification nonce is created and saved the user record. The user record indicates:

forgotPasswordNonce|passwordHash|passwordSalt
---------------------------------------------
XXX|old|old

Server sends an email to the user with the `forgotPasswordNonce`. 

Server responds 200 with JSON indicating to check email.

## Step 2. Update password (POST /v2/accounts/account/password)

User POSTS `/v2/accounts/account/password` with body:

```
{
  username: String, username of the account
  nonce: String, verification nonce
  newPassword: String, new password
}
```

Server updates user record to indicate:

forgotPasswordNonce|passwordHash|passwordSalt
---------------------------------------------
null|new|new