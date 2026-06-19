# Contributing to Wireline

Guide for new engineers joining the team. Read this before your first PR.

---

## Quick Setup

```bash
# Prerequisites: Node 22+, npm 10+
git clone https://github.com/mikelaurenzo7-collab/wireline.git
cd wireline

# Install dependencies
npm install

# Copy env (fill in secrets you have — app works without most of them)
cp .env.example .env

# Start dev server (Vite frontend + Express API)
npm run dev          # → http://localhost:3000

# Verify the active migration gate
npm run verify       # build + bundled-server smoke
```

## Current migration state

Wireline is in an active Stitch-inspired Studio migration. The old visual contract docs were retired so the product can move cleanly without old design ratchets reasserting themselves.

For Studio work, use these files as the current source of truth:

- `src/components/AgentStudioCanvas.tsx`
- `src/styles/stitch-studio.css`
- `src/pages/Training.tsx`

`npm run verify` is intentionally narrowed to build + smoke during this pass. Use `npm run verify:full` only when intentionally running the legacy full gate.

## Architecture Overview

```
src/
├── pages/           # React pages (lazy-loaded routes)
├── components/      # Reusable UI
├── routes/          # Express API handlers
├── lib/             # Pure logic (agent runtime, billing, integrations)
├── middleware/      # Auth, rate limits, validation, RBAC
├── db/              # Drizzle schema (single source of truth)
├── data/            # Static config
├── types/           # Shared TypeScript types
├── constants/       # App-wide constants
├── contexts/        # React contexts
├── hooks/           # Custom React hooks
└── services/        # Client-side API service layer
```

Key files to understand first:

- `server.ts` — Express boot + Vite dev middleware
- `src/lib/agent-runtime.ts` — system prompt composition
- `src/lib/claude-models.ts` — LLM tiering constants
- `src/lib/plan-catalog.ts` — pricing + plan definitions
- `src/components/AgentStudioCanvas.tsx` — active Stitch Studio surface
- `src/styles/stitch-studio.css` — shared Stitch UI primitives
- `src/middleware/auth.ts` — JWT auth middleware
- `src/db/schema.ts` — database schema

## Development Workflow

### Branch Strategy

```
main (production) ← feature branches
```

1. Branch off `main`: `git checkout -b feat/your-feature`
2. Make changes and run `npm run verify` locally
3. Push and open a PR against `main`
4. CI runs the current migration gate: build → smoke
5. Merge after green deploy/review

### Commit Messages

Imperative subject ≤72 chars, one blank line, body explaining why:

```
Add voice cloning upload validation

Operators upload recordings from phones; without format validation
the ElevenLabs API rejects them with an opaque 422. Validate on
our side first and surface actionable error messages.
```

## Running Tests

```bash
npm run test          # Vitest watch mode
npm run test:run      # Single-shot
npm run test:coverage # With coverage report
npm run verify:full   # Legacy full gate for later hardening
```

## Database Changes

```bash
# 1. Edit src/db/schema.ts
# 2. Generate migration
npm run db:generate

# 3. Apply locally
npm run db:migrate

# 4. Verify
npm run db:studio
```

All migrations use `IF NOT EXISTS` — safe to re-run.

## Code Standards

### TypeScript

- Strict mode remains enabled where configured.
- Avoid `as any` at assignments — use proper types or `as unknown as T`.
- Use Zod for external input validation.
- Express routes use `validateBody()` / `validateQuery()` middleware.

### Security Checklist

- [ ] No secrets in source code
- [ ] New routes have rate limiting
- [ ] New routes have auth middleware or are intentionally public
- [ ] User input is validated with Zod before use
- [ ] Database queries are parameterized
- [ ] Webhook endpoints verify signatures
- [ ] URL inputs are guarded against SSRF where relevant

### Styling

- For Studio work, follow `AgentStudioCanvas.tsx` and `stitch-studio.css`.
- Use the Stitch dark shell: near-black workspace, charcoal glass panels, subtle grid, violet primary action, lavender text accents, compact monospaced kickers.
- Do not resurrect old Lavender Noir, rich-cream, cyberpunk, or Grok-flair contracts during this migration.
- Tailwind remains the primary styling surface; `src/styles/stitch-studio.css` is allowed for shared Stitch primitives.
- Laptop and desktop are first-class: use `lg:`, `xl:`, and `2xl:` layouts so 1440px+ screens do not feel tablet-sized.
- Touch targets: minimum 44×44px hit area on mobile while keeping visual density compact.
- Use `clsx()` + `tailwind-merge` for conditional classes.

### Testing

- Unit tests live next to their source: `foo.ts` → `foo.test.ts`.
- E2E tests live in `tests/e2e/`.
- Test critical paths: auth, billing, voice agent runtime, webhooks.
- Coverage/full ratchets are paused from default verify during the migration and remain available through `npm run verify:full`.

## Key Patterns

### Auth

Sessions use an **httpOnly** `wireline_session` cookie (`SameSite=Lax`, `Secure` in production). The client calls APIs with `credentials: "include"`. Bearer tokens in `Authorization` are still accepted for scripts and legacy flows; they are not stored in `localStorage`.

`POST /api/auth/migrate-session` is rate-limited and rotates the JWT when moving off legacy `localStorage`. Send the legacy JWT only via `Authorization: Bearer …`; do not return tokens in JSON responses.

### CSRF posture

SameSite=Lax blocks most cross-site cookie sends on `POST`. For defense in depth, `assertSameOrigin` rejects unsafe `/api/*` requests when `Origin` or `Referer` is present and not in `APP_URL` / `CORS_ORIGINS`. Vendor webhooks, Stripe, Twilio, and public intake ingest routes are excluded.

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
