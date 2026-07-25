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

### Node.js runtime

The repo prefers **Node 22** (`.nvmrc`, `vercel.json` `build.env.NODE_VERSION`) for full modern features, but `package.json` `engines` accepts `>=20 <23` to prevent install warnings when the Vercel project dashboard is still set to 20.x.

In Vercel → wireline → Settings → General, set **Node.js Version** to **22.x** (recommended). Vercel uses `package.json` `engines.node` during installs, so once the dashboard is updated to 22 the strict preference takes effect cleanly. The flexible engines eliminate the known "project 20.x / package 22.x" warning in the meantime.

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

When adding a new var, **check all 3 boxes** in the Vercel UI so it
applies everywhere. The CLI version (`vercel env add`) requires a
specific branch for Preview which is awkward — prefer the UI.

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
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`          | Outbound SMS, inbound webhook                                                                                       |
| `OWNER_PHONE` / `OWNER_EMAIL` / `PLATFORM_SMS_FROM` | Escalation routing (where agent escalations go). Set `OWNER_EMAIL=mikelaurenzo7@gmail.com` for the founder account. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`       | Billing                                                                                                             |
| `OPENAI_API_KEY`                                    | Primary managed structured runtime (direct OpenAI Responses API, GPT-5.6 Terra) and OpenAI Realtime live-voice demos |
| `XAI_API_KEY`                                       | Optional xAI experiments only; structured fallback also requires `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=true`      |
| `GEMINI_API_KEY`                                    | Second automatic structured fallback and grounded-search fallback                                                   |
| `OPENROUTER_API_KEY`                                | Optional — Director chat model picker (Pro+ in app; company key; voice runtime unchanged)                           |

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
(https://dashboard.vapi.ai → Phone Numbers). Currently 10 numbers:

**4 customer-service lines (real Wireline support):**

- Sarah — Customer Support — (630) 642-5661
- Liam — Sales & Demos — (630) 581-1834
- Tyler — Technical Support — (564) 238-9455
- Maya — Book a Demo — (630) 642-5927

Each has the `escalate_to_human` tool wired to
`https://trywireline.com/api/escalate` with the shared webhook secret.

**6 vertical demos (proof of platform breadth):**

- Marcus · Medical Office Intake · (617) 313-4469
- Aisha · Real Estate Lead Capture · (973) 363-8874
- Devon · Bill Negotiator · (207) 593-5155
- Elena · Insurance Claims Intake · (904) 460-1596
- Priya · Executive Assistant · (572) 726-9365
- Jake · Outbound SDR · (469) 257-1581

Each demo agent role-plays their job and pitches Wireline when asked.

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
