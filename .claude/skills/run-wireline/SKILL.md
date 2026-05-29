---
name: run-wireline
description: Run, screenshot, and visually QA the Wireline app. Covers build, launch, Playwright-driven screenshots of public and authenticated pages (agent chat, fleet, channel pages), and CI pipeline context. Use for "run the app", "screenshot the chat page", "visual QA", "take screenshots", "check layout".
---

# Wireline — run skill

Wireline is a React/TypeScript SPA (Vite) + Express API server. The SPA is
served by `vite preview` or `dist/server.cjs`; the API lives in `server.ts`.
Visual QA uses Playwright with `chromium` (no `chromium-cli` binary — use
the `playwright` npm package directly from the project).

**Playwright browsers path (container):**
```
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers
```
Install with: `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npx playwright install chromium`

---

## Prerequisites

```bash
cd /home/user/Wireline
npm ci                                                  # install deps
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npx playwright install chromium
```

No system packages needed — Playwright bundles its own Chromium.

---

## Build

```bash
npm run build           # Vite + esbuild → dist/
# Output: dist/index.html, dist/assets/, dist/server.cjs
```

---

## Run (agent path — Playwright visual QA)

The fastest path is `vite preview` (serves the last build) + a Playwright
script. Scripts live in `screenshot-pages.mjs` at repo root and run from
there so the `playwright` package resolves.

### 1. Start the preview server

```bash
npx vite preview --port 4173 --host &
sleep 4
curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/
# → 200
```

### 2. Public pages (no auth needed)

```javascript
// screenshot-pages.mjs — run as: PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers node screenshot-pages.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:4173";
const OUTDIR = "./screenshots";

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"],
});

const pages = [
  { path: "/",        name: "landing-desktop", width: 1280, height: 900 },
  { path: "/",        name: "landing-mobile",  width: 390,  height: 844 },
  { path: "/pricing", name: "pricing-desktop", width: 1280, height: 900 },
];

for (const { path, name, width, height } of pages) {
  const page = await browser.newPage({ viewport: { width, height }, ignoreHTTPSErrors: true });
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUTDIR}/${name}.png` });
  console.log(`✓ ${name}.png`);
  await page.close();
}
await browser.close();
```

```bash
mkdir -p screenshots
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers node screenshot-pages.mjs
```

### 3. Authenticated pages (agent chat, fleet, ops)

The QA session token from `tests/helpers/wireline-auth.ts` injects auth via
localStorage. Use it to access `/chat`, `/agents`, `/phone`, etc.

**Local preview (`vite preview`) redirects to `/signin` for authenticated
routes** because it has no database. Use the **Vercel preview URL** from the
latest deployment for authenticated page QA:

```
https://wireline-git-<branch-slug>-revaluate.vercel.app
```

Branch slug = branch name with non-alphanumeric chars → `-`, lowercased.
Example: `claude/landing-page-improvements-vOu3s` → `claude-landing-page-improvements-vou3s`

```javascript
// Authenticated screenshot helper
// QA_SESSION is loaded from tests/helpers/wireline-auth.ts (single source of
// truth). See driver.mjs for the runtime import — the token is not duplicated here.

async function withAuth(browser, width, height, base) {
  const page = await browser.newPage({ viewport: { width, height }, ignoreHTTPSErrors: true });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => localStorage.setItem("wireline_session", JSON.stringify(s)), QA_SESSION);
  await page.reload({ waitUntil: "domcontentloaded" });
  return page;
}
```

Key authenticated routes:

| Route | Page |
|---|---|
| `/chat` | Agent chat — Director + agents rail + conversation |
| `/chat/:agentId` | Per-agent chat thread |
| `/agents` | Fleet settings — agent cards grid |
| `/phone` | Phone channel (call logs + outbound) |
| `/email` | Email channel |
| `/sms` | SMS channel |
| `/activity` | Cross-channel activity hub |
| `/training` | Agent training + knowledge |
| `/ops` | Live Ops / command center |
| `/insights` | Voice analytics + latency |

---

## Run (human path)

```bash
npm run dev         # Express + Vite dev server on :3000 (requires .env + DB)
```

The dev server needs env vars — see `.env.example`. Without a real Supabase
DB the app boots but most authenticated pages return errors. Use the Vercel
preview URL instead for visual QA of authenticated pages.

---

## CI pipeline

9 steps in the `verify` job (`.github/workflows/ci.yml`):

1. `npm audit --audit-level=high --omit=dev`
2. `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit` — needs the 4096 flag (100K+ LOC OOMs at default 1.5GB)
3. `node scripts/check-user-id-inserts.mjs`
4. `npm run lint:eslint` — zero warnings tolerated
5. `npm run test:coverage` — Vitest, 538 tests, coverage ratchet
6. `npm run docs:check`
7. `npm run lint:strict` — strict tsconfig
8. `npm run build`
9. `npm run smoke:server`

Then `e2e` (needs `verify`): Playwright against the Vercel preview URL.
`PLAYWRIGHT_BASE_URL` is set to `https://wireline-git-<slug>-revaluate.vercel.app`.

---

## Gotchas

- **No `chromium-cli` binary** — use `playwright` npm package directly, run scripts from the project root dir (where `node_modules/playwright` lives).
- **Authenticated pages on vite preview** — vite preview is static-only, no backend. Authenticated routes redirect to `/signin`. Use the Vercel preview URL for auth QA.
- **QA token expires 2026-06-03** — update `tests/helpers/wireline-auth.ts` `QA_SESSION.access_token` when it expires.
- **SSL in container** — local container has outdated CA certs; Vercel HTTPS fails. Use `--ignore-certificate-errors` in Playwright launch args and `ignoreHTTPSErrors: true` in page options when targeting Vercel from this environment.
- **`tsc --noEmit` OOMs** — always use `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit`, never bare `npx tsc`.
- **Welcome modal** — QA account triggers a "Welcome to WIRELINE" onboarding tour on first login. Dismiss it with: `await page.locator('button[aria-label="Close"], button:has-text("×")').first().click()` or press Escape.
- **`BigInt` in callLogs.id** — the schema uses `bigint(mode:"bigint")`. The route normalizes with `Number(r.id)` before `res.json()`. Do NOT remove this.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ERR_MODULE_NOT_FOUND: playwright` | Run the script from project root, not `/tmp` |
| `vite preview` port already in use | `pkill -f "vite preview"` then restart |
| Authenticated route redirects to signin | Use Vercel preview URL, not `vite preview` |
| `FATAL ERROR: ... heap out of memory` in tsc | Use `--max-old-space-size=4096` flag |
| CI `e2e` fails on api-health / authenticated-dashboard | Vercel preview not yet deployed — wait ~2min after push |
