# Wireline E2E Testing with Playwright

End-to-end coverage targets **high-leverage operator journeys**: auth shell behavior, public API contracts, authenticated navigation shells, fleet agent creation, outbound campaigns, and a small set of visual baselines.

## Quick start

```bash
# One-time browser install
npx playwright install chromium

# All E2E tests (3 browser projects locally — desktop, phone, tablet)
npm run e2e

# CI-style run: single desktop project, 2 retries, one worker
CI=true npm run e2e

# Full browser matrix in CI (default CI is desktop-only for speed)
CI=true E2E_FULL_MATRIX=1 npm run e2e

# Subset
npx playwright test e2e/userflows/api-health.spec.ts
npx playwright test --grep "Authentication"
```

## Environment

| Variable | Purpose |
|----------|---------|
| `E2E_BASE_URL` | Target origin (default `http://localhost:3000`, must match dev server) |
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | Primary test operator (Vercel naming) |
| `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | Local alias for the same account |
| `CI` | When set, enables `forbidOnly`, retries, single worker, and **desktop-only** projects unless `E2E_FULL_MATRIX=1` |
| `E2E_FULL_MATRIX` | Set to `1` with `CI` to run mobile + tablet projects in automation |

`playwright.config.ts` starts `npm run dev` unless `reuseExistingServer` applies (local dev with a server already on port 3000).

## Layout

```
e2e/
├── fixtures/
│   └── auth.ts              # Shared login + cookie dismiss helpers
├── userflows/
│   ├── api-health.spec.ts   # Public API smoke (health, plans, OpenAPI)
│   ├── auth.spec.ts         # Auth shell, invalid login, success, logout, deep links
│   ├── navigation-smoke.spec.ts  # Authenticated /dashboard, /logs, /outbound, /admin Carrier
│   ├── voice-agent.spec.ts  # /agents → My Fleet → create agent (subscription-aware)
│   └── campaign.spec.ts     # Outbound campaigns, CSV, lifecycle (credential-gated)
├── visual/
│   ├── dashboard.spec.ts    # Snapshot — requires credentials
│   └── components.spec.ts   # Login form + authenticated rail snapshots
└── README.md
```

## Coverage audit (completeness)

| Area | Spec | Status |
|------|------|--------|
| Public API contracts | `api-health.spec.ts` | Always runs (no login) |
| Auth portal UX | `auth.spec.ts` | Login screenshot, bad password, success, logout, deep link preserves URL |
| Authenticated shells | `navigation-smoke.spec.ts` | Dashboard, logs, outbound, admin Carrier tab |
| Fleet / voice agents | `voice-agent.spec.ts` | Uses real `/agents` route (not legacy `/agents/new`) |
| Outbound campaigns | `campaign.spec.ts` | Modal, CSV validation, full flow, stop, detail (flexible UI) |
| Visual regression | `visual/*.spec.ts` | Baselines; **require credentials** for dashboard/rail |

**Intentionally out of scope for Playwright (lower ROI or external deps):**

- Real PSTN / Vapi dial audio (use manual smoke + Vapi dashboard)
- Stripe checkout success in live mode (use Stripe test clocks / webhook fixtures)
- Claude / LLM generation content assertions (flaky; covered in unit/integration tests)
- Full email OAuth (third-party redirects)

## Golden-path script

`scripts/e2e-golden-paths.mjs` is a lightweight **HTTP** smoke (no browser). Default `E2E_BASE_URL` there is still `http://localhost:5173` in the file header — align with your dev port or export `E2E_BASE_URL=http://localhost:3000` when invoking.

## Visual workflow

1. First run creates `*-snapshots/` under each project.
2. On UI changes: `npx playwright test --update-snapshots`.
3. Review HTML report and image diffs in CI artifacts.

## Adding a test

Prefer `e2e/fixtures/auth.ts` for login. Use `test.skip(!hasE2eCredentials(), …)` when the journey needs a real tenant. Avoid brittle CSS selectors; prefer role + accessible name.
