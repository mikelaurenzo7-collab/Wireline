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
npm install ws  # needed by supervisor-websocket-service
```

Create a minimal `.env` if one doesn't exist (the app starts without a real DB
but logs connection errors):

```bash
[ -f .env ] || cat > .env << 'EOF'
DATABASE_URL=postgresql://localhost:5432/wireline_dev
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder
SESSION_SECRET=dev-secret
EOF
```

Start both servers:

```bash
# Kill any previous instances
pkill -f 'tsx.*server/main' 2>/dev/null; pkill -f 'vite' 2>/dev/null; sleep 1

# Express backend (port 3000)
npx tsx server/main.ts &
echo $! > /tmp/wireline-express.pid

# Vite dev server (port 5173)
npx vite --host &
echo $! > /tmp/wireline-vite.pid

# Wait for Vite to be ready
timeout 60 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

## Run (agent path) — Playwright driver

The driver supports four actions:

```bash
# Smoke test: landing page + Director Chat (or login redirect)
node .claude/skills/run-wireline/driver.mjs smoke

# Screenshot a specific route
node .claude/skills/run-wireline/driver.mjs screenshot --route /pricing

# Interact: attempt to type in Director Chat (needs auth)
node .claude/skills/run-wireline/driver.mjs interact

# Screenshot all major routes for visual QA
node .claude/skills/run-wireline/driver.mjs routes
```

**Options:**
- `--url URL` — base URL (default: `http://localhost:5173`)
- `--route PATH` — route for `screenshot` action (default: `/`)
- `--out DIR` — screenshot output dir (default: `/tmp/wireline-screenshots`)
- `--headed` — visible browser (non-headless)

Screenshots land in `/tmp/wireline-screenshots/` as PNG files at 2x retina
resolution (1440×900 viewport).

## Run (human path)

```bash
npm run dev
```

Opens Vite at `http://localhost:5173`. The Express backend starts alongside via
the dev script. Ctrl-C to stop.

## Stop

```bash
kill $(cat /tmp/wireline-express.pid) 2>/dev/null
kill $(cat /tmp/wireline-vite.pid) 2>/dev/null
pkill -f 'tsx.*server/main' 2>/dev/null
pkill -f 'vite' 2>/dev/null
```

## Test

```bash
npx vite build          # type-check + bundle (fastest validation)
npx vitest run          # unit tests (if configured)
```

Note: bare `tsc --noEmit` shows hundreds of pre-existing errors from missing
ambient type declarations — use `vite build` for validation instead.

## Routes

| Route | Auth? | What it shows |
|---|---|---|
| `/` | No | Marketing landing page |
| `/pricing` | No | Plans & pricing |
| `/demos` | No | Demo lines |
| `/compare` | No | Competitor comparison |
| `/about` | No | About page |
| `/director` | Yes | Director Chat (AI workspace) |
| `/agents` | Yes | Agent fleet management |
| `/training` | Yes | Training & playbooks |
| `/ops` | Yes | Operations dashboard |
| `/insights` | Yes | Analytics & insights |
| `/integrations` | Yes | Integration marketplace |
| `/settings` | Yes | Account settings |

Authenticated routes redirect to the login page at `/auth`.

## Gotchas

- **`ws` package not in deps**: `npm install` alone misses it. The Express
  server imports `ws` for supervisor websockets. Run `npm install ws` or the
  server crashes on start.
- **No database needed for frontend**: The Express server logs Postgres
  connection errors but continues serving. The Vite SPA works fully for
  public routes without a DB.
- **Auth-gated routes**: Director Chat, agents, training, ops, insights,
  integrations, and settings all redirect to `/auth` (login page) without
  a session. The driver's `interact` action gracefully detects this.
- **Vite first-paint latency**: First navigation after cold start can take
  5-10s while Vite compiles on demand. The driver uses `networkidle` +
  2s buffer to handle this.
- **TypeScript errors are pre-existing**: The repo has hundreds of TS errors
  from missing `@types/*` packages. `vite build` succeeds because it uses
  esbuild for transpilation, not tsc for checking.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE :5173` | `pkill -f vite` then restart |
| `EADDRINUSE :3000` | `pkill -f 'tsx.*server/main'` then restart |
| `Cannot find package 'ws'` | `npm install ws` |
| `browserType.launch: Executable doesn't exist` | `npx playwright install --with-deps chromium` |
| Blank screenshot | Wait longer — increase `waitForTimeout` in driver or check `console --errors` |
| DB connection errors in Express logs | Expected without Postgres; frontend still works |
