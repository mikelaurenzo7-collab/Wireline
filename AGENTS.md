# Wireline — Agent Instructions

## Cursor Cloud specific instructions

### Overview

Wireline is a single full-stack AI voice & email agent fleet management platform. Tech stack: React 19 + Vite (frontend), Express + TypeScript (backend), PostgreSQL via Supabase + Drizzle ORM (database), deployed on Vercel.

### Running the dev server

```bash
npm run dev
```

This starts Express with Vite middleware on `http://localhost:3000`. Both frontend and API are served from the same port. The server reads `.env` via `dotenv`.

**Important:** The `POSTGRES_URL` env var must be a **Supabase Transaction-mode pooled** connection string (port 6543, hostname like `aws-N-REGION.pooler.supabase.com`). The `@vercel/postgres` package (v0.10) detects pooled URLs by checking for `-pooler.` in the string. New-style Supabase pooler hostnames use `.pooler.` instead, so the URL must include `?application_name=-pooler.wireline` as a workaround for the detection check. Without this, the server logs `invalid_connection_string` errors.

If the `POSTGRES_URL` secret provided by Cursor Cloud is a direct connection (port 5432, `db.*.supabase.co`), you must unset it in the shell before running the dev server so dotenv picks up the correct value from `.env` or **`.env.local`** (e.g. `vercel env pull`). The `CORS_ORIGINS` secret may also need to be unset — when it contains only the production URL, the CORS middleware rejects `localhost` requests and the frontend fails to load scripts. In dev mode with empty `CORS_ORIGINS`, the server allows all origins.

```bash
unset POSTGRES_URL CORS_ORIGINS && npm run dev
```

### Lint, test, and build

| Task | Command |
|------|---------|
| TypeScript check | `npm run lint` |
| ESLint | `npm run lint:eslint` |
| Format check | `npm run format:check` |
| Unit tests (Vitest) | `npm run test:run` |
| Unit tests + Vercel env pull first | `npm run test:run:vercel` (needs `VERCEL_TOKEN` + `vercel link`) |
| E2E tests (Playwright) | `npm run e2e` |
| E2E + Vercel env pull first | `npm run e2e:vercel` |
| Full verify | `npm run verify` |
| Full verify + Vercel env pull first | `npm run verify:vercel` |
| Build | `npm run build` |

### Database schema

Schema is defined in `src/db/schema.ts`. Use Drizzle Kit for migrations:

```bash
POSTGRES_URL="<pooled-url>" npx drizzle-kit push    # push schema changes
POSTGRES_URL="<pooled-url>" npx drizzle-kit generate # generate migration files
```

`drizzle-kit push` with `strict: true` prompts interactively for each table change — press Enter to accept "create table" for new tables.

### Environment variables

See `.env.example` for the full list. Required for dev:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — frontend auth
- `SUPABASE_SERVICE_ROLE_KEY` — backend privileged ops
- `INTERNAL_JWT_SECRET` — session JWT signing
- `POSTGRES_URL` — database (must be pooled, see note above)
- `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` — AI providers
- `VAPI_PRIVATE_KEY`, `VITE_VAPI_PUBLIC_KEY` — voice platform

Optional integrations (Stripe, Twilio, Slack, CRM, etc.) degrade gracefully when unset.

### Pre-commit hooks

Husky runs `lint-staged` on commit, which applies Prettier formatting and ESLint (max 400 warnings) to staged `.ts`/`.tsx` files.

## Performance Optimizations

The following performance optimizations have been implemented:

### 1. Claude Model Tiering (`src/lib/claude-brain.ts`)

Implements intelligent model selection based on task complexity to reduce AI costs by 60-80%:

| Tier | Model | Cost | Use Case |
|------|-------|------|----------|
| Simple | Haiku | $1/M tokens | Classification, extraction, summaries |
| Medium | Sonnet | $3/M tokens | Analysis, reasoning, structured output |
| Complex | Opus | $15/M tokens | Deep research, creative writing, multi-step reasoning |

**Usage:**
```typescript
// Use complexity parameter instead of explicit model
const result = await runStructured({
  system: "Extract key information...",
  user: inputText,
  tool: extractionTool,
  complexity: "simple", // Auto-selects Haiku
});
```

### 2. Dashboard Stats Caching (`src/lib/dashboard-cache.ts`)

In-memory TTL cache for dashboard statistics:
- **TTL:** 60 seconds
- **Max entries:** 500 (LRU eviction)
- **Performance gain:** ~200-500ms → ~5-10ms (cache hit)

**Cache invalidation:**
```typescript
import { invalidateDashboard } from "./lib/dashboard-cache";
invalidateDashboard(userId); // Clear specific user cache
```

### 3. Database Indexes (`src/db/schema.ts`)

B-tree indexes added to frequently queried tables:
- `callLogs`: user_id, agent_id, created_at (composite)
- `outboundLeads`: user_id, campaign_id, status (composite)
- `fleetTasks`: user_id, status (composite)
- `emailThreads`: user_id, lead_score (composite)
- `auditLog`: user_id, event_type, created_at (composite)

**Apply indexes:**
```bash
POSTGRES_URL="<pooled-url>" npx drizzle-kit push
```

### 4. Async Webhook Processing (`src/lib/vapi-webhook-queue.ts`)

Vapi webhooks are queued for async processing to prevent timeouts:
- **Problem:** Vapi webhooks timeout after ~5 seconds
- **Solution:** Queue `end-of-call-report` for background processing
- **Result:** Immediate 200 OK response, no duplicate processing

**Sync handlers (immediate response):**
- `assistant-request` — returns assistant config
- `tool-calls` — returns tool results
- `status-update` (in-progress/ringing) — real-time presence

**Async handlers (queued):**
- `end-of-call-report` — AI analysis, logging, webhooks
- `conversation-update` — deep sentiment analysis (when triggered)
