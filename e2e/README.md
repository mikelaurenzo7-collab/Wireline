# Wireline E2E Testing with Playwright

## Projects

| Project | Purpose |
|---------|---------|
| `chromium` | Unauthenticated flows, login UI, legal pages, outbound gate — **default in CI** |
| `chromium-mobile` / `chromium-tablet` | Same tests except `@auth-desktop` and `@desktop-only` (grep-inverted) |
| `setup` + `chromium-authed` | When `E2E_USER_EMAIL` + `E2E_USER_PASSWORD` are set: writes `e2e/.auth/user.json`, then runs every `@auth-desktop` journey (full navigation, hubs, admin tabs, rail, command palette, campaigns, visuals) |

## Quick Start

```bash
# Install browsers (one-time)
npx playwright install chromium

# Run Chromium-only (matches CI)
npx playwright test --project=chromium

# Authenticated deep suite (needs working POSTGRES_URL + valid user)
E2E_USER_EMAIL=you@example.com E2E_USER_PASSWORD='…' npx playwright test --project=chromium-authed

# Run with UI for debugging
npx playwright test --ui

# Record visual baselines locally (snapshots are skipped when CI=true in specs)
npx playwright test --update-snapshots
```

## Test Structure

```
e2e/
├── auth.setup.ts          # Writes storage state when E2E credentials exist
├── helpers/               # Shared auth + shell assertions
├── userflows/             # Auth, navigation, campaigns, fleet, command palette
├── visual/                # Optional screenshots
├── .auth/user.json        # Generated; gitignored (.gitkeep keeps folder)
└── README.md              # This file
```

## Environment Variables

```bash
E2E_BASE_URL=http://localhost:3000

# Optional: deployed preview (disables Playwright webServer)
# E2E_BASE_URL=https://your-app.vercel.app

E2E_USER_EMAIL=you@example.com
E2E_USER_PASSWORD=yourpassword
# Legacy: E2E_TEST_EMAIL, E2E_TEST_PASSWORD

# CI=true on GitHub Actions — retries + snapshot skips in visual specs
```

Playwright’s `webServer` child process sets `NODE_ENV=development`, clears `VERCEL`, and clears `CORS_ORIGINS` so Vite HMR from `http://localhost:3000` is never blocked by production CORS inherited from the parent shell.

## Tag conventions

- **`@auth-desktop`**: requires `e2e/auth.setup.ts` session; desktop layout (floating rail, hub strips).
- **`@desktop-only`**: excluded from mobile/tablet via `grepInvert` (for future narrow-viewport skips).

## Critical User Flows Covered

- [x] Authentication (login UI, invalid credentials, successful login when creds + DB exist)
- [x] Public legal pages (`/privacy`, `/terms`)
- [x] Outbound route shows sign-in when logged out
- [x] Full route map + hub tabs + admin tabs + rail + ⌘K palette (`@auth-desktop`)
- [x] Campaign modal / CSV paths (`@auth-desktop`, needs API + DB)
- [x] Fleet / agents tabs (`@auth-desktop`)

## Adding New Tests

Use `signInSubmitButton(page)` from `e2e/helpers/auth.ts` for the email form — the screen has two controls named “Sign In” (mode tab + submit).

```typescript
import { test, expect } from "@playwright/test";

test("describe what you're testing", async ({ page }) => {
  await page.goto("/your-route");
  await expect(page.getByRole("button")).toBeVisible();
});
```
