# Auth rate-limit audit UUID fix

Production evidence from Vercel shows `security.rate_limit_exceeded` audit writes failing because auth rate limiters pass an email address into `wireline_audit_log.user_id`, which is a UUID column.

## Required source patch

File: `src/middleware/rate-limit-middleware.ts`

In `signinRateLimiter`, replace:

```ts
userId: email,
```

with:

```ts
metadata: email ? { email } : undefined,
```

In `forgotPasswordRateLimiter`, replace:

```ts
userId: email,
```

with:

```ts
metadata: email ? { email } : undefined,
```

## Why

Unauthenticated auth surfaces only know an email candidate, not a Wireline user UUID. The audit log should keep that candidate in metadata while leaving `user_id` null. Authenticated rate limiters such as email, outbound dial, and resend verification should continue passing the real `req.user.id` UUID.

## Verification

After deploy, check Vercel runtime errors for this signature:

```txt
invalid input syntax for type uuid: "...@..."
```

The signature should stop after the deployment containing this source change.
