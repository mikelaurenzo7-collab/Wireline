# Demo account login

Use on every naive-dogfood run.

```
URL:      https://trywireline.com/auth
Email:    wireline.demo@trywireline.com
Password: WirelineDemo!2026
```

## Steps

1. `browser_navigate` → `https://trywireline.com/auth`
2. `browser_snapshot` → find email and password fields
3. `browser_fill` email → `wireline.demo@trywireline.com`
4. `browser_fill` password → `WirelineDemo!2026`
5. Click Sign in / Submit
6. `browser_wait` → confirm landing in authenticated shell (not auth error)

## Session-start reset

After login, before Director/Painter probes:

- **Chat** → Clear thread
- **Design** → Clear thread

See [demo-tenant.md](demo-tenant.md) for why.

## If login fails

Stop and ask the user. Do not search the repo for alternate credentials mid-run.
