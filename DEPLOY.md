# Deploy Guide

## TL;DR — to deploy a change

```bash
git add -A
git commit -m "your message"
git push   # → triggers automatic Vercel preview build
```

That's it for branch / PR previews. Vercel auto-deploys every push to a
preview URL; you'll see the URL in the PR's check run.

To promote a preview to production:

1. **Push to `main`** — set **Production Branch** to `main` in
   [Vercel → wireline → Settings → Git](https://vercel.com/revaluate/wireline/settings/git)
   so every merge auto-assigns `target: production` to trywireline.com.
2. If production is still on a feature branch (e.g. `cursor/elevate-business-concept-d625`),
   previews from `main` and PRs will **not** update trywireline.com until you
   change that setting or promote manually.
3. Manual promote (any READY deployment from `main`):

   ```bash
   export VERCEL_TOKEN="<token>"
   node scripts/promote-vercel-production.mjs
   ```

   Or: `vercel deploy --prod --yes` from the repo root.

Both production aliases (`trywireline.com`, `wireline-chi.vercel.app`,
`wireline-revaluate.vercel.app`) update together when a deployment is promoted.

### Canonical Vercel project

**Only `revaluate/wireline` may be linked to this GitHub repo.** That project owns
trywireline.com and the production secrets inventory. A second linked project
(historically named `workspace`) will also receive every `main`/PR push, fail
`scripts/check-deployment-boundaries.mjs` when Production env is empty, and
paint a red **Vercel – workspace** status on the commit even when `wireline` is
green. If that happens: unlink the duplicate under Vercel → project → Settings →
Git (or delete the project). Do not copy production secrets into a second
project to silence the check.

### Node.js runtime

The repo is pinned to **Node 22** across `.nvmrc`, `package.json` (`engines.node: "22.x"`), and `vercel.json` (`build.env.NODE_VERSION: "22"`). Keep Vercel -> wireline -> Settings -> General on **Node.js 22.x** before promoting production builds.

If Vercel reports an install/runtime mismatch, fix the project dashboard setting rather than widening `package.json` engines. The strict pin is intentional so previews, CI, and production use the same runtime family.

### Tooling majors (TypeScript / Vite)

Dependabot must not open major bumps for `typescript`, `vite`, `@vitejs/plugin-react`,
or `@types/node` (see `.github/dependabot.yml`). Vercel’s post-`build:vercel`
function step uses the **local user-provided** TypeScript from `node_modules`;
TypeScript 7.0.2 failed there with `Cannot read properties of undefined (reading
'readFile')` even after a green app build + smoke. Vite 8 is a separate Rolldown
migration. Keep `typescript` on 6.x, `vite` on 6.x, and `@types/node` on 22.x
until an intentional upgrade PR proves Vercel + CI green.

### Release gate and preview migration policy

Wireline merges must be held until the release gate is actionable. A deploy is
not release-ready when GitHub Actions reports a startup failure before jobs
materialize, has a blank workflow name, or exposes no job logs/steps; that state
is an infrastructure/App integration blocker, not a trustworthy application
build signal. In that case:

1. Do **not** merge reliability, billing, auth, data, or migration-affecting PRs
   on the assumption that the missing logs are harmless.
2. Confirm the Vercel preview is `READY` and inspect runtime logs for the
   affected environment.
3. Confirm CodeQL/security checks that do materialize are green.
4. Leave the PR open with the exact blocker and retry only after GitHub Actions
   produces named jobs with readable logs, or after the infrastructure blocker
   is explicitly accepted by the owner.

Vercel previews must never apply migrations to a shared production database.
The explicit `build:vercel` command intentionally routes through `scripts/vercel-build.mjs`.
That wrapper runs `npm run db:migrate` only when `VERCEL_ENV=production` or
`WIRELINE_RUN_MIGRATIONS=true`; all preview builds should log that migrations
were skipped before running the normal production build. Keep this wrapper wired
in `package.json` and do not replace it with `npm run db:migrate && npm run build`.

---

## Environment variables

All env vars live in Vercel project settings:
https://vercel.com/revaluate/wireline/settings/environment-variables

| Scope           | What it covers                               |
| --------------- | -------------------------------------------- |
| **Production**  | The 3 prod aliases above                     |
| **Preview**     | Every branch PR — auto-deployed preview URLs |
| **Development** | Local `vercel dev` runs (rarely used here)   |

When adding a new var, set it only in the targets where that value is
safe. Production secrets belong in **Production**; Preview/Development
must use dedicated sandbox credentials or stay unset. Do not widen a
production value across all targets unless `.env.example`, this guide,
and `scripts/check-deployment-boundaries.mjs` explicitly allow it.

### Var inventory (key ones)

| Var                                                 | Why it exists                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                           | Base URL for OAuth callbacks, Stripe webhooks, Vapi assistant config                                                |
| `CORS_ORIGINS`                                      | Allowed origins for cross-origin API requests                                                                       |
| `POSTGRES_URL`                                      | Supabase Postgres connection                                                                                        |
| `INTERNAL_JWT_SECRET`                               | Wireline session JWT signing. Canonical name; `SUPABASE_JWT_SECRET` is only a legacy alias.                         |
| `VAPI_PRIVATE_KEY`                                  | Server-side Vapi API calls                                                                                          |
| `VITE_VAPI_PUBLIC_KEY`                              | In-browser Vapi widget                                                                                              |
| `VAPI_WEBHOOK_SECRET`                               | Auth on `/api/vapi-webhook` and `/api/escalate`                                                                     |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`          | Account identity and webhook signature validation. Keep `TWILIO_AUTH_TOKEN` for webhook auth even when REST uses API keys. |
| `TWILIO_API_KEY` / `TWILIO_API_SECRET`              | Preferred scoped REST credential for outbound Twilio API calls.                                                     |
| `OWNER_PHONE` / `OWNER_EMAIL` / `PLATFORM_SMS_FROM` | Escalation routing (where agent escalations go). Set `OWNER_EMAIL=mikelaurenzo7@gmail.com` for the founder account. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`       | Billing                                                                                                             |
| `OPENAI_API_KEY`                                    | Primary managed structured runtime (direct OpenAI Responses API, GPT-5.6 Terra) and OpenAI Realtime live-voice demos |
| `GEMINI_API_KEY`                                    | First automatic structured fallback and grounded-search fallback                                                    |
| `AI_GATEWAY_API_KEY`                                | Governed continuity route through Vercel AI Gateway                                                                 |
| `XAI_API_KEY`                                       | Optional xAI experiments only; structured fallback also requires `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=true`      |

### Internal JWT secret cleanup

Keep exactly one canonical session-signing secret in Vercel: `INTERNAL_JWT_SECRET`.
If `SUPABASE_JWT_SECRET` also exists, delete it only after confirming it is either
identical to `INTERNAL_JWT_SECRET` or after intentionally rotating sessions. If both
names are set to different values, production startup/checks fail because one part
of the app could sign tokens that another part rejects.

### Database migrations

Run `npm run db:migrate` before promoting schema-dependent releases, then run
`npm run db:health`. For signup-attribution releases, confirm
`0017_add_signup_intent.sql` has applied; the health check fails when those
attribution columns are missing.

---

## Vapi agents

Phone numbers live in the Vapi dashboard
(https://dashboard.vapi.ai -> Phone Numbers). The code source of truth is
`src/data/contact-agents.ts`; update this section whenever that roster changes.

**2 Wireline employee lines (support + sales, owner escalation enabled):**

- Sarah - Wireline Specialist - (630) 642-5661
- Liam - Wireline Specialist - (630) 581-1834

Both employee agents have the `escalate_to_human` tool wired to
`https://trywireline.com/api/escalate` with the shared webhook secret.

**7 public demo lines (role-play showcases, no owner escalation):**

- Jordan - Inbound Customer Service Demo - (630) 642-5927
- Ria - Demo Concierge - (564) 238-9455
- Marcus - Medical Practice Demo - (617) 313-4469
- Diana - Law Firm Demo - (572) 726-9365
- Aisha - Real Estate Demo - (973) 363-8874
- Elena - Insurance Demo - (904) 460-1596
- Jake - Outbound Sales Demo - (469) 257-1581

Jordan and Jake are the primary landing-page demo calls. All demo agents
role-play their job and pitch Wireline when asked; demo lines cannot page the
owner.

If you rotate `VAPI_WEBHOOK_SECRET`, you ALSO need to update the
`server.secret` on each customer-service agent's `escalate_to_human`
tool in Vapi (do it via the dashboard or PATCH each assistant).

---

## Domain & DNS

- `trywireline.com` — primary domain, owned by you, set up in Vercel
- `wireline-chi.vercel.app` — legacy alias, kept live for old links
- `wireline-revaluate.vercel.app` — Vercel team default, kept for fallback

All three point at the same active production deployment.

---

## Troubleshooting

**Vapi calls hang up with "public webhook signature" error**
→ `VAPI_WEBHOOK_SECRET` in Vercel doesn't match the `server.secret`
on the phone number / tool config in Vapi. Rotate both sides.

**OAuth redirect mismatch (Google / Microsoft)**
→ Google Cloud Console: add `https://trywireline.com` to JavaScript
origins AND `https://trywireline.com/api/oauth/google/callback`
to redirect URIs. Same pattern for Microsoft (Azure AD).

**OAuth returns to `/auth/oauth-complete` with "Failed to start session"**
→ The provider login succeeded, but the short-lived session bridge table
is missing or unavailable. Run the latest database migrations; the app
also attempts to create `wireline_oauth_pending_codes` automatically on
the next callback if the production database role has DDL permission.

**Stripe webhook fails**
→ Stripe Dashboard → Webhooks → confirm endpoint URL is
`https://trywireline.com/api/stripe-webhook`.

**GitHub Actions shows a blank workflow name, zero jobs, or missing logs**
→ Treat it as a release-gate infrastructure blocker. Re-run after checking
GitHub Actions/App installation health, repository Actions settings, and any
third-party status checks. Do not merge blocked PRs until named jobs and logs
are available, unless the owner explicitly accepts the infrastructure risk.

**Vercel preview tries to run database migrations**
→ Stop the merge. `package.json` must keep `"build:vercel":
"node scripts/vercel-build.mjs"` and preview environments must leave
`WIRELINE_RUN_MIGRATIONS` unset or `false`. Only production builds or explicit
migration test runs may set it to `true`.

**Preview build fails author-email check**
→ Already mitigated. If it returns: set
`git config user.email "<your GitHub noreply email>"`
in this repo.

---

## CLI cheatsheet

```bash
# Trigger a manual deploy (skips git, uploads local files)
vercel deploy --prod --yes --force

# Check what's deployed where
vercel ls

# Inspect a specific deployment
vercel inspect <deployment-url>

# Promote any deployment to production
vercel alias set <deployment-url> trywireline.com
vercel alias set <deployment-url> wireline-chi.vercel.app

# Pull production env vars to a local file
vercel env pull .env.local --environment=production
```
