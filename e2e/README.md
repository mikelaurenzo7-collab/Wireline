# Wireline E2E Testing with Playwright

## Quick Start

```bash
# Install browsers (one-time)
npx playwright install chromium

# Run all e2e tests
npx playwright test

# Run specific test file
npx playwright test userflows/auth.spec.ts

# Run with UI for debugging
npx playwright test --ui

# Update snapshots after intentional visual changes
npx playwright test --update-snapshots
```

## Test Structure

```
e2e/
├── userflows/       # End-to-end user journeys (auth, agent creation, etc.)
├── visual/          # Visual regression tests (screenshot comparisons)
├── screenshots/     # Baseline screenshots for comparison
└── README.md        # This file
```

## Environment Variables

```bash
# Test target (local dev server — same port as `npm run dev`)
E2E_BASE_URL=http://localhost:3000

# Optional: run Playwright against a deployed preview instead of local
# (set `APP_URL` / `CORS_ORIGINS` on that deployment so the browser origin matches).
# E2E_BASE_URL=https://wireline-chi.vercel.app

# Test credentials (for auth flows). Prefer E2E_USER_* (matches CI / Vercel naming).
E2E_USER_EMAIL=you@example.com
E2E_USER_PASSWORD=yourpassword
# Legacy aliases still supported:
# E2E_TEST_EMAIL=…
# E2E_TEST_PASSWORD=…

# CI mode
CI=true  # Runs with retries, single worker
```

## Visual Regression Workflow

1. **First run**: Creates baseline screenshots
2. **Subsequent runs**: Compares against baseline
3. **On intentional changes**: Run with `--update-snapshots`
4. **Review diffs**: Check `test-results/` folder or HTML report

## Critical User Flows Covered

- [x] Authentication (login/logout)
- [x] Dashboard rendering (desktop/mobile)
- [x] Voice agent creation
- [ ] Campaign management
- [ ] Call log review
- [ ] Settings configuration
- [ ] Billing flow

## Adding New Tests

```typescript
import { test, expect } from "@playwright/test";

test("describe what you're testing", async ({ page }) => {
  await page.goto("/your-route");

  // Interactions
  await page.getByRole("button").click();

  // Assertions
  await expect(page.getByText("expected text")).toBeVisible();

  // Visual snapshot (optional)
  await expect(page).toHaveScreenshot("name.png");
});
```
