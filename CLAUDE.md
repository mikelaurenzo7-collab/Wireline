# CLAUDE.md

Guidance for assistants working in this repository. These instructions override
default behavior — follow them.

## What Wireline is

Wireline is a horizontal **AI voice + email agent platform** — one fleet of
agents that handles inbound calls, outbound dialing, SMS, and email for
businesses and personal workflows.

It is a single TypeScript codebase: a **React 19 + Vite** frontend and an
**Express** API that build into one **Vercel** serverless function. Data lives in
**Postgres (Supabase)** via **Drizzle ORM**. Voice runs on **Vapi + ElevenLabs**.
LLM reasoning is tiered across **Anthropic** (Sonnet for voice, Opus for
reasoning) with Gemini/OpenRouter fallbacks.

## Current product pass

Wireline is in an active **Stitch-inspired dark studio** migration. The previous
design-contract docs were retired so the product can migrate cleanly before
stricter checks are restored. Use the implemented Studio/Training screens as the
current visual reference. Keep changes buildable and focused on the product
surface.

For Studio work, treat these as the source of truth:

- `src/components/AgentStudioCanvas.tsx`
- `src/styles/stitch-studio.css` (plus `stitch-console.css`, `studio-clarity.css`)
- `src/pages/Training.tsx`

Do **not** resurrect retired contracts (Lavender Noir, rich-cream, cyberpunk,
Grok-flair) during this migration.

## Useful docs

| Topic | Read |
|---|---|
| System design, LLM tiering, data flows | `ARCHITECTURE.md` |
| Engineering patterns, branch/commit/test conventions | `CONTRIBUTING.md` |
| Database setup & migrations | `DATABASE_SETUP.md` |
| Deployment (Vercel) | `DEPLOY.md` |
| Codebase health / cleanup tracking | `CODEBASE_HEALTH.md` |
| Doc index, SOC 2, SLA, incident response, authz matrix | `docs/` |

## Repository layout

```
server.ts            # Express boot, route registration, Vite dev middleware
api/index.ts         # Vercel serverless entrypoint (imports the bundled server)
contracts/           # Shared API type contracts
drizzle/migrations/  # 59 idempotent SQL migrations (IF NOT EXISTS)
scripts/             # Ops scripts (db health, vapi/stripe sync, dogfood, checks)
tests/e2e/           # Playwright E2E
tests/integration/   # Tenant-isolation integration tests
src/
├── pages/           # React route pages (lazy-loaded)
├── components/      # Reusable UI (~104 files; Studio/Director/CommandCenter)
├── routes/          # Express API handlers (~63 routers, mounted in server.ts)
├── lib/             # Pure logic: agent runtime, billing, LLM, integrations (~251)
├── middleware/      # auth, rate limits, validation, RBAC, same-origin, timeout
├── services/        # Long-running services (dialer, calendar sync, websockets)
├── db/schema.ts     # Drizzle schema — single source of truth (57 tables)
├── contexts/        # React contexts (Auth, Account, Agents, Theme, Toast, Branding)
├── hooks/           # Custom React hooks (streaming chat, presence, chrome tabs)
├── data/            # Static config (voice roster, showcase agents, knowledge)
├── constants/       # Brand colors, navigation
├── styles/          # Stitch CSS layers + design-system CSS
└── types/           # Shared TS types (api, auth, audit)
```

Mobile shells live in `android/` and `ios/` (Capacitor-style native wrappers).

### Files to understand first

- `server.ts` — Express boot + route registration + Vite dev middleware
- `src/lib/agent-runtime.ts` — system-prompt composition from agent config
- `src/lib/claude-models.ts` — **LLM tiering constants (source of truth)**
- `src/lib/plan-catalog.ts` — pricing + plan definitions
- `src/db/schema.ts` — database schema
- `src/middleware/auth.ts` — session auth + tenant resolution
- `src/components/AgentStudioCanvas.tsx` — active Stitch Studio surface

## Commands

```bash
npm run dev            # Vite frontend + Express API on one process (tsx server.ts)
npm run verify         # migration gate: build + bundled-server smoke test
npm run verify:full    # legacy full gate (lint, authz, csp, docs, test, build, smoke)
npm run build          # render assets, Vite build, esbuild server bundle
npm run start          # run the production bundle (dist/server.cjs)
npm run lint           # tsc --noEmit
npm run lint:eslint    # eslint --max-warnings 0 src/
npm run format         # prettier --write src
npm run test           # vitest watch (excludes e2e)
npm run test:run       # vitest single-shot
npm run db:generate    # generate migration from src/db/schema.ts edits
npm run db:migrate     # apply migrations
npm run db:push        # push schema directly in dev
npm run db:studio      # visual schema browser
npm run db:health      # verify RLS + connectivity per environment
```

Node 22+ is required (`engines.node >= 22`, `.nvmrc`).

## Development workflow

1. Branch off `main` (`feat/your-feature`); PRs target `main`.
2. Make changes; run `npm run verify` locally (build + smoke).
3. **CI** (`.github/workflows/ci.yml`) runs the same narrowed gate:
   `npm run build` → `npm run smoke:server`. CodeQL also runs.
4. `verify:full` is the legacy full gate, paused from default during the Stitch
   migration but still available for intentional hardening.

A Husky `pre-commit` hook runs `lint-staged` (prettier + eslint --fix) on
staged `*.ts`/`*.tsx`.

### Database changes

Edit `src/db/schema.ts` → `npm run db:generate` → `npm run db:migrate` →
verify with `npm run db:studio`. All migrations use `IF NOT EXISTS` and are
safe to re-run. Account deletion cascades manually through all tables via
`src/lib/account-deletion.ts`.

## Key conventions

### Auth

Sessions use an **httpOnly `wireline_session` cookie** (`SameSite=Lax`, `Secure`
in production), issued as an internal JWT. The client calls APIs with
`credentials: "include"`. `Authorization: Bearer` is still accepted for scripts
and legacy flows; tokens are **not** stored in `localStorage`. The sign-in UI is
`FigmaAuthPortal` (routes `/signin`, `/signup`, `/get-started`).

> **Note:** Clerk was evaluated and removed — the app is back on the native auth
> portal. `clerk-*` files and the `@clerk/*` deps are legacy/unmounted; do not
> wire new auth through Clerk. Use `src/middleware/auth.ts` (`authenticateUser`).

```typescript
import { authenticateUser } from "../middleware/auth";
router.get("/api/foo", authenticateUser, handler);
```

### Tenant isolation

Postgres RLS keys off `tenantStore` (`app.current_user_id`). Never trust an
`x-wireline-tenant-id` header — `resolveTenantId` pins the tenant to the
authenticated user id until real org-membership checks exist.

### Rate limiting

```typescript
import { createRateLimiter } from "../middleware/api-rate-limits";
const fooLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
router.post("/api/foo", authenticateUser, fooLimiter, handler);
```

Upstash Redis backs limits in production; in-memory LRU is the local fallback.

### Input validation

Validate all external input with Zod before use:

```typescript
import { validateBody } from "../lib/api-validation";
import { z } from "zod";

const schema = z.object({ name: z.string().min(1).max(100) });
router.post("/api/foo", authenticateUser, validateBody(schema), handler);
```

### CSRF / same-origin

`SameSite=Lax` blocks most cross-site cookie sends. `assertSameOrigin` rejects
unsafe `/api/*` requests when `Origin`/`Referer` is present and not in
`APP_URL`/`CORS_ORIGINS`. Vendor webhooks (Vapi, Stripe, Twilio, ElevenLabs) and
public intake routes are excluded and instead verify HMAC signatures.

### Routes

Each feature owns a router file in `src/routes/*-routes.ts`, imported and
mounted in `server.ts`. Keep route handlers thin; put logic in `src/lib`.

### LLM tiering

Model choices are governed by `src/lib/claude-models.ts` (the *what*);
`ARCHITECTURE.md` explains the *why*. Voice runtime uses Sonnet (latency-bound);
reasoning paths (`claude-recipes.ts`: brief/coach/postCallAnalysis/dailyBrief)
use Opus. `npm run docs:check` fails the legacy gate if docs drift from
constants. When building new LLM features, default to the latest, most capable
Claude models.

### TypeScript & styling

- Strict mode where configured; avoid `as any` (use `as unknown as T`).
- Tailwind is the primary styling surface; `src/styles/stitch-*.css` holds
  shared Stitch primitives. Use `clsx()` + `tailwind-merge` for conditionals.
- Laptop/desktop are first-class (`lg:`/`xl:`/`2xl:`); 44×44px min touch targets
  on mobile.

### Security checklist (new routes)

- [ ] No secrets in source
- [ ] Auth middleware applied (or intentionally public)
- [ ] Rate limiting applied
- [ ] Zod-validated input
- [ ] Parameterized queries
- [ ] Webhook endpoints verify signatures
- [ ] URL inputs guarded against SSRF where relevant

## Environment

See `.env.example` for the canonical key list. Core production keys:
`POSTGRES_URL`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `VAPI_PRIVATE_KEY` +
`VAPI_WEBHOOK_SECRET`, `INTERNAL_JWT_SECRET`, `STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
The app runs without most optional keys for local dev.
