# Contributing to Wireline

Guide for new engineers joining the team. Read this before your first PR.

---

## Quick Setup

```bash
# Prerequisites: Node 20+, npm 10+
git clone https://github.com/mikelaurenzo7-collab/wireline.git
cd wireline

# Install dependencies
npm install

# Copy env (fill in secrets you have — app works without most of them)
cp .env.example .env

# Start dev server (Vite frontend + Express API)
npm run dev          # → http://localhost:3000

# Verify everything works
npm run verify       # typecheck + docs:check + test + build
```

## Architecture Overview

```
src/
├── pages/           # React pages (lazy-loaded routes)
├── components/      # Reusable UI (~140 files)
├── routes/          # Express API handlers (50+ route files)
├── lib/             # Pure logic (agent runtime, billing, integrations)
├── middleware/      # Auth, rate limits, validation, RBAC
├── db/              # Drizzle schema (single source of truth)
├── data/            # Static config (contact agents, verticals)
├── types/           # Shared TypeScript types
├── constants/       # App-wide constants
├── contexts/        # React contexts
├── hooks/           # Custom React hooks
└── services/        # Client-side API service layer
```

Key files to understand first:
- `server.ts` — Express boot + Vite dev middleware (single process on port 3000)
- `src/lib/agent-runtime.ts` — System prompt composition (the moat)
- `src/lib/claude-models.ts` — LLM tiering constants
- `src/lib/plan-catalog.ts` — Pricing + plan definitions
- `src/lib/wireline-director-design.ts` — Director UI copy, CSS class contract, capability catalog
- `src/middleware/auth.ts` — JWT auth middleware
- `src/db/schema.ts` — Complete database schema

## Development Workflow

### Branch Strategy

```
main (production) ← feature branches
```

1. Branch off `main`: `git checkout -b feat/your-feature`
2. Make changes, run `npm run verify` locally
3. Push and open a PR against `main`
4. CI runs: typecheck → eslint → tests → build → smoke → e2e
5. Merge after CI green + review

### Commit Messages

Imperative subject ≤72 chars, one blank line, body explaining **why**:

```
Add voice cloning upload validation

Operators upload recordings from phones; without format validation
the ElevenLabs API rejects them with an opaque 422. Validate on
our side first and surface actionable error messages.
```

### Running Tests

```bash
npm run test         # Vitest watch mode
npm run test:run     # Single-shot (CI mode)
npm run test:coverage # With coverage report

# E2E (requires dev server running)
npm run test:e2e     # Playwright chromium suite
```

### Database Changes

```bash
# 1. Edit src/db/schema.ts
# 2. Generate migration
npm run db:generate

# 3. Apply locally
npm run db:migrate

# 4. Verify
npm run db:studio    # Visual schema browser
```

All migrations use `IF NOT EXISTS` — safe to re-run.

## Code Standards

### TypeScript

- Strict mode on moat-adjacent files (see `tsconfig.strict.json`)
- No `as any` at assignments — use proper types or `as unknown as T`
- Zod for all external input validation
- Express routes use `validateBody()` / `validateQuery()` middleware

### Security Checklist (every PR)

- [ ] No secrets in source code
- [ ] New routes have rate limiting
- [ ] New routes have auth middleware (or are intentionally public)
- [ ] User input is validated with Zod before use
- [ ] Database queries are parameterized (Drizzle handles this)
- [ ] Webhook endpoints verify signatures
- [ ] No SSRF vectors in URL inputs (use `isSsrfUrl()` guard)

### Styling

- Read `DESIGN.md` before changing UI — shadcn primitives, Aurora Cream tokens, ratchet rules
- Director / mission-control surfaces: use `WL_DIRECTOR_CLASSES` and shared copy from `wireline-director-design.ts`; run `npm run test:design` when the contract changes
- Tailwind CSS 4 — no raw CSS except `src/index.css` globals
- Mobile-first: design for 390px, scale up with `sm:`, `md:`, `lg:`
- Touch targets: minimum 44×44px hit area on mobile, achieved via invisible `::after` pseudo-elements or transparent padding — NOT by inflating visual container size. Visual heights stay compact (36px inputs, 32px secondary buttons, 20px icons).
- Use `clsx()` + `tailwind-merge` for conditional classes

### Testing

- Unit tests live next to their source: `foo.ts` → `foo.test.ts`
- E2E tests live in `tests/e2e/`
- Test critical paths: auth, billing, voice agent runtime, webhooks
- Coverage ratchets: CI fails if coverage drops below current thresholds

## Key Patterns

### Auth

Sessions use an **httpOnly** `wireline_session` cookie (`SameSite=Lax`, `Secure` in production). The client calls APIs with `credentials: "include"`. Bearer tokens in `Authorization` are still accepted for scripts and legacy flows; they are not stored in `localStorage`.

`POST /api/auth/migrate-session` is rate-limited and rotates the JWT when moving off legacy `localStorage`. Send the legacy JWT only via `Authorization: Bearer …` (not a JSON body); do not return tokens in JSON responses.

When `POSTGRES_URL` is configured as a GitHub Actions secret, CI runs `tests/integration/agent-tenant-isolation.integration.test.ts` against live Postgres.

### CSRF posture

SameSite=Lax blocks most cross-site cookie sends on `POST`. For defense in depth, `assertSameOrigin` (in `server.ts`) rejects `POST`/`PUT`/`PATCH`/`DELETE` on `/api/*` when `Origin` or `Referer` is present and not in `APP_URL` / `CORS_ORIGINS`. Vendor webhooks under `/api/webhooks/*`, Stripe, Twilio, and public intake ingest (`/api/intake/lead`, `/api/intake/leads`) are excluded. Intake key management (`/api/intake/keys`, etc.) is origin-checked.

```typescript
import { authenticateUser } from "../middleware/auth";
router.get("/api/foo", authenticateUser, handler);
```

### Rate Limiting

```typescript
import { createRateLimiter } from "../middleware/api-rate-limits";
const fooLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
router.post("/api/foo", authenticateUser, fooLimiter, handler);
```

### Input Validation

```typescript
import { validateBody } from "../lib/api-validation";
import { z } from "zod";

const schema = z.object({ name: z.string().min(1).max(100) });
router.post("/api/foo", authenticateUser, validateBody(schema), handler);
```

### RBAC

```typescript
import { requirePermission } from "../middleware/require-role";
router.put("/api/settings", authenticateUser, requirePermission("settings.manage"), handler);
```

## What NOT to Do

- Don't add `cookie-parser` without CSRF defenses
- Don't duplicate CSP logic (use `src/lib/csp.ts`)
- Don't add new Claude routes without adding them to the spend-cap array
- Don't remove or weaken existing tests
- Don't commit `.env` or any secrets
- Don't use `console.log` — use the structured `log.*` logger

## Getting Help

- Architecture questions → read `ARCHITECTURE.md`
- UI / design system → `DESIGN.md` + `src/lib/wireline-director-design.ts`
- SOC 2 context → `docs/soc2-policies.md`
- Pricing questions → `src/lib/plan-catalog.ts` (single source of truth)
- Voice agent behavior → `src/lib/agent-runtime.ts` + `personality-vibes.ts`
- Deployment → `DEPLOY.md`
- Doc index → `docs/README.md`

---

*Welcome to the team. Ship small, ship often, keep the moat sharp.*
