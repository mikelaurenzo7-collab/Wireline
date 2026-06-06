---
name: run-wireline
description: Build, launch, and drive the Wireline web app. Use when asked to run, start, screenshot, smoke-test, or visually QA Wireline.
---

# Run Wireline

Wireline is a React 19 + Vite 6 SPA with an Express backend. The app serves
a marketing site (landing, pricing, demos) on public routes and an authenticated
operator console (Director Chat, agents, training, ops, integrations, settings)
behind login.

Drive it with the **Playwright driver** at
`.claude/skills/run-wireline/driver.mjs`.

## Prerequisites

```bash
apt-get update && apt-get install -y curl
npx playwright install --with-deps chromium
```

Playwright chromium installs its own system deps via `--with-deps`.

## Build & Start

All paths relative to the repo root.

```bash
npm install
```

Create a minimal `.env` if one doesn't exist (the app starts without a real DB
but logs connection errors):

```bash
[ -f .env ] || cat > .env << 'EOF'
POSTGRES_URL=postgresql://localhost:5432/wireline_dev
APP_URL=http://localhost:3000
INTERNAL_JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
EOF
```

**Dev server (recommended):** one process serves API + Vite HMR on port **3000**:

```bash
npm run dev
# → http://localhost:3000
```

`server.ts` mounts Vite middleware in development — do **not** run a separate
Vite process on 5173 unless you are debugging Vite in isolation.

Production-style validation:

```bash
npm run verify   # lint + docs:check + authz:check + test + build
```

## Run (agent path) — Playwright driver

The driver supports five actions:

```bash
# Smoke test: landing page + Director Chat (or login redirect)
node .claude/skills/run-wireline/driver.mjs smoke

# Screenshot a specific route
node .claude/skills/run-wireline/driver.mjs screenshot --route /pricing

# Interact: attempt to type in Director Chat (needs auth)
node .claude/skills/run-wireline/driver.mjs interact

# Screenshot all major routes for visual QA
node .claude/skills/run-wireline/driver.mjs routes

# Responsive QA: key routes at mobile (390) / tablet (834) / desktop (1440)
node .claude/skills/run-wireline/driver.mjs viewports
# …or one route across all three breakpoints, full-page:
node .claude/skills/run-wireline/driver.mjs viewports --route /pricing --full
```

**Options:**
- `--url URL` — base URL (default: `http://localhost:3000`)
- `--route PATH` — route for `screenshot` / `viewports` (default: `/`)
- `--out DIR` — screenshot output dir (default: `/tmp/wireline-screenshots`)
- `--full` — full-page (scrolled) screenshots for `viewports`, not just the fold
- `--headed` — visible browser (non-headless)
- `--block-external` — abort all non-base-origin requests (fonts, analytics).
  Use in network-restricted environments where blocked third-party requests
  would otherwise stall navigation.

Screenshots land in `/tmp/wireline-screenshots/` as PNG files at 2x retina
resolution (default desktop 1440×900; `viewports` emits `vp-<size>-<route>.png`
for mobile 390 / tablet 834 / desktop 1440 — Wireline designs mobile-first at
390px, so that's the canonical small breakpoint).

The driver waits with `commit` + a poll for the React root to render — **not**
`networkidle`. The app holds long-lived connections (auth SSE, analytics), so
`networkidle` never settles and every navigation would time out.

## Network-restricted environments (no outbound internet)

In sandboxes without outbound internet (e.g. Claude Code on the web with a
locked-down network policy), the **dev server is unusable for the browser**:
Vite serves modules on demand and its dependency optimizer stalls without
network, so `npm run dev` navigations hang on `/node_modules/.vite/deps/*`.
**Production mode (`NODE_ENV=production`) also refuses to boot** — it requires a
healthy Postgres ("Database connection failed — refusing to start in production
mode").

Serve the **pre-built static bundle** instead, which needs neither Vite nor a
DB, and drive it with `--block-external`:

```bash
npm run build                                   # → dist/ (static SPA + assets)
npx vite preview --port 4173 --host 127.0.0.1 & # serve dist/ statically
node .claude/skills/run-wireline/driver.mjs routes \
  --url http://127.0.0.1:4173 --block-external
```

API calls 404 against `vite preview` (it's static-only), so this is for
**frontend / visual QA**; the marketing pages render fully and auth-gated routes
still redirect to the sign-in gate.

## Authenticated QA — client console + in-chat Google Stitch render

Auth-gated routes (`/chat`, `/agents`, `/training`, `/ops`, `/insights`,
`/integrations`, `/admin`) redirect to `/auth` without a session. To screenshot
the **real operator console** without a database, use the second driver,
`.claude/skills/run-wireline/authed-qa.mjs`. It intercepts every request: it
fulfills `/api/**` with mocks (so `/api/auth/session` returns a mock owner and the
console renders), lets same-origin app assets through, and aborts off-origin
requests so `networkidle` settles.

Critically, it mocks `GET /api/director/messages` with a Director thread that
**includes a Google Stitch in-chat render** — the `DirectorStitchPreviewGallery`
only mounts when a message's `previews[0]` is a Stitch preview (`kind:"stitch"`),
so the mock supplies one with an inline SVG data-URL screenshot. This renders the
Screenshot / Live HTML / Export tabs and the device-framed design preview with
zero network and no real Stitch backend.

Run it against the static preview (works in network-restricted sandboxes), once
per breakpoint for responsive coverage:

```bash
npm run build
npx vite preview --port 4173 --host 127.0.0.1 &   # serve dist/ statically

for VP in "390x844:mobile" "834x1112:tablet" "1440x900:desktop"; do
  SIZE="${VP%%:*}"; NAME="${VP##*:}"
  QA_URL=http://127.0.0.1:4173 QA_VIEWPORT=$SIZE QA_OUT=/tmp/wireline-screenshots/$NAME \
    QA_ROUTES="/chat,/agents,/training,/ops,/insights,/integrations,/admin" \
    node .claude/skills/run-wireline/authed-qa.mjs
done
```

Screenshots land in `/tmp/wireline-screenshots/<size>/authed-<route>.png`; the
`/chat` shot shows the live Stitch gallery. The script also writes
`authed-qa.json` with a flex-height diagnostic per route (flags content clipped
mid-viewport or large bottom dead-space). `QA_VIEWPORT` defaults to `1440x900`,
`QA_ROUTES` to the full sidebar set.

**Expected noise (not failures):** `Failed to load resource: net::ERR_FAILED`
(aborted off-origin fonts/analytics) and, on `/ops`, an `EventSource ... MIME
type` warning (the SSE endpoint gets a JSON mock). Both are harmless for visual QA.

## Run (human path)

```bash
npm run dev
```

Opens at `http://localhost:3000`. Ctrl-C to stop.

## Stop

Kill the dev process (Ctrl-C) or:

```bash
pkill -f 'tsx.*server\.ts' 2>/dev/null || true
```

## Test

```bash
npm run lint          # TypeScript check (tsc --noEmit)
npm run test:run      # Vitest unit tests
npm run test:design   # Design contract + shadcn ratchet
npm run build         # Production bundle
```

Use `npm run verify` before pushing — it runs the full CI-equivalent pipeline.

## Routes

| Route | Auth? | What it shows |
|---|---|---|
| `/` | No | Marketing landing page |
| `/pricing` | No | Plans & pricing |
| `/demos` | No | Demo lines |
| `/compare` | No | Competitor comparison |
| `/about` | No | About page |
| `/chat` | Yes | Director Chat (AI workspace; renders in-chat Google Stitch designs) |
| `/agents` | Yes | Agent fleet management |
| `/training` | Yes | Training & playbooks |
| `/ops` | Yes | Operations dashboard |
| `/insights` | Yes | Analytics & insights |
| `/integrations` | Yes | Integration marketplace |
| `/admin` | Yes | Account settings (branding, team, billing, carrier) — the "Settings" nav target; `/settings` is **not** a route and 404s |

Authenticated routes redirect to the login page at `/auth`.

## Gotchas

- **Single dev port:** API and frontend both live on **3000** via `npm run dev`.
  The Playwright driver defaults to `http://localhost:3000`.
- **No database needed for frontend:** The server logs Postgres connection errors
  but continues serving. Public marketing routes work without a DB.
- **Auth-gated routes:** Director Chat, agents, training, ops, insights,
  integrations, and settings all redirect to `/auth` without a session. The
  driver's `interact` action gracefully detects this.
- **Vite first-paint latency:** First navigation after cold start can take
  5–10s while Vite compiles on demand. The driver waits with `commit` + a poll
  for the React root to populate (not `networkidle`, which never settles here).
- **Env stubbing:** Missing Stripe / Vapi / Anthropic keys return 503 with
  actionable JSON — the console still loads for UI work.
- **Director Chat route is `/chat`, not `/director`:** `/director` redirects to
  the `/auth` sign-in gate. The authenticated workspace (and the in-chat Stitch
  render) lives at `/chat` — that's what `authed-qa.mjs` screenshots.
- **Stitch gallery is metadata-gated:** `DirectorStitchPreviewGallery` only
  mounts when a Director message's `previews[0]` is a Stitch preview
  (`kind:"stitch"` or a rationale matching `/google stitch/i`). To QA it without
  the real Stitch backend, mock `/api/director/messages` to include one — see the
  `STITCH_CONVERSATION` mock in `authed-qa.mjs`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE :3000` | Stop the other process on 3000 or `pkill -f 'tsx.*server\.ts'` |
| `browserType.launch: Executable doesn't exist` | `npx playwright install --with-deps chromium` |
| Blank screenshot | Wait longer — increase wait in driver or check console errors |
| DB connection errors in logs | Expected without Postgres; frontend still works on public routes |
| Driver hits wrong port | Pass `--url http://localhost:3000` (5173 is legacy / Vite-only) |
| Every navigation times out / pages hang | No outbound internet — see "Network-restricted environments": build + `vite preview` + `--block-external` |
