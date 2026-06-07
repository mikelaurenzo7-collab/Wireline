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

The repo requires **Node 22+** (`.nvmrc`, `package.json` `engines`, and
`vercel.json` `build.env.NODE_VERSION`). In Vercel → wireline → Settings →
General, set **Node.js Version** to **22.x** if the dashboard still shows 20.x.

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
| `ANTHROPIC_API_KEY`                                 | Claude API for agent reasoning                                                                                      |
| `GEMINI_API_KEY`                                    | Gemini fallback + grounded web research for Director context                                                        |
| `OPENROUTER_API_KEY`                                | Optional — Director chat model picker (Pro+ in app; company key; voice runtime unchanged)                           |
| `GOOGLE_STITCH_API_KEY`                             | Google Stitch SDK/MCP API key for Director UI/media generation                                                      |
| `GOOGLE_STITCH_PROJECT_ID`                          | Stitch web project id from `stitch.withgoogle.com/projects/{id}` (not a Google Cloud id)                            |
| `DIRECTOR_STITCH_MEDIA_ENABLED`                     | Enables Director routing for Stitch mockup/website/hero requests (`true`/`false`)                                   |

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
