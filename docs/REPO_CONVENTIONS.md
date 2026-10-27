# BotBound repo conventions

How work lands in this repo (mikelaurenzo7-collab/Wireline — the BotBound
codebase). Kept short on purpose; the Cursor rules in `.muse/rules/`
carry the always-on subset.

## The merge gate

GitHub Actions are **disabled by the owner's decision** (repo Settings →
Actions → "Disable actions"). Fourteen workflow files sit dormant in the
tree; that is intended, not broken. Do not propose enabling them.

The gate instead:

1. Work happens on a branch, one PR per logical unit ("car") of a change
   train.
2. The reviewer reads the **complete diff against the car's spec** —
   scope, test pins updated in the same PR, no unrelated churn.
3. Mergeable state is confirmed, then a merge commit lands it on `main`.
4. Render auto-deploys botbound-api, botbound-jobs-sweep, and
   botbound-daily-brief from `main`. **botbound-voice is released
   deliberately**: pre-drain the old worker (`node deploy/render/drain-voice.mjs`,
   see the render.yaml header), then deploy the same commit — a blind
   redeploy SIGTERMs live call control.
5. At the **end of a train**, verify all four services run the final SHA
   and smoke the production surfaces (homepage, /pricing, /trust,
   /contact, /signup). Log time, SHA, services, and smoke result in the
   deploy log. Mid-train verification only on a failure signal or a
   build-risk change.

## Database migrations

- Migrations **never auto-apply** — not on deploy, boot, or CI (by design;
  render.yaml states there is no migration command).
- A migration PR must contain, in the same change: the migration SQL, its
  entry in `drizzle/migrations/meta/_journal.json`, and the regenerated
  `meta/NNNN_snapshot.json`. A contract test pins snapshot↔journal
  alignment.
- Promotion is manual from a clean checkout of the exact release SHA via
  `scripts/promote-production-schema.mjs`, using the production
  `POSTGRES_URL` direct endpoint (:5432) from Render's secret store.
  Supabase is only the Postgres host (no Supabase Auth/client in the app).

## Environment & deploy config

- `render.yaml` is the blueprint; the Render **Dashboard is authoritative**
  after sync. Release switches and secrets are declared `sync: false` —
  names only, never values, never invented names.
- A var belongs in render.yaml only if code reads it. Authorities:
  usage billing → `USAGE_BILLING_ENV_VARS` (`src/lib/usage-billing-config.ts`);
  federal DNC → `src/lib/federal-dnc-config.ts` (`FEDERAL_DNC_API_URL`,
  `FEDERAL_DNC_API_KEY`, `FEDERAL_DNC_PROVIDER`).
- `.env.example` is documentation and can drift stale — verify env claims
  against code before acting on them.

## Product & pricing truth

- Pricing is the **usage model** (the only client pricing layout):
  Lite $12/mo ($4 included work), Starter $24/mo ($14; signup default),
  Plus $49/mo ($36). One shared allowance across calls/SMS/email/Computer;
  no rollover; alerts at 50/80/100%. Rates: calls $0.25/min by the second,
  Computer $0.20/min, email $0.02 per sent reply, SMS $0.04 per sent US
  segment; extra number +$3/mo, extra email +$4/mo; default monthly limit
  $100, bots pause at limit. Tax is added separately.
- The channels catalog (`src/lib/plan-catalog.ts`) is server-side data that
  stored records reference. Client code must not resurrect a second
  pricing layout from it.
- Sold bot roles (create-dialog presets): Sales Rep, Front Desk, Recruiter,
  Appointment Setter, Customer Support.
- Voice: production live calls run xAI Grok Voice (pin `grok-voice-3.0`,
  never the alias) with OpenAI Realtime as fallback; a number answers on
  xAI only if registered (`wireline_xai_phone_registrations`) — registration
  must join number provisioning. Browser/Cloud Computer is OpenAI
  (GPT-5.6 Terra), fails closed without it.
- Never have a bot claim to be human. AI-identification behavior is a
  deliberate product decision (jurisdiction/carrier rules can require it) —
  don't change greetings casually.

## Single sources of truth

Forking these definitions is how surfaces start disagreeing:

| Concern | Home |
| --- | --- |
| Call outcome taxonomy | `src/lib/call-outcome.ts` |
| Agent role ids/labels/defaults | `src/lib/agent-role-definitions.ts` |
| Delivery tone label | `resolveDeliveryToneLabel` in `src/lib/compose-setup-personality.ts` |
| Appointment counting (excl. Cancelled) | `appointmentsInWindow` in `src/lib/appointment-where.ts` |
| Tab ids + legacy param aliases | `src/lib/page-sub-tabs.ts`, `src/pages/PhonePage.tsx` |
| Marketing footer / workspace header | `MarketingChromeBar`, `WorkspaceShell` |

Tab ids match their labels; renamed ids keep resolving through the alias
maps so old links, emails, and bookmarks land correctly.

## Copy & design

Owner directives (Oct 2026), enforced in review:

- Minimal copy: no redundant heroes, eyebrows, or descriptor stacks;
  pages start at their content. Muse (muse.ai) is the primary IA/design
  inspiration, tailored to BotBound.
- Market every surface as fully ready — SMS, outbound, every use case.
  Hedge copy ("coming soon", "not available yet", "inbound only") on
  marketing/product surfaces is a defect. Compliance-fact copy (consent,
  screening, carrier facts) stays — it's regulatory fact, not hedging.
- Accounts are personal (1 bot) or SMB (1–few bots). Don't build fleet
  chrome (rankings, dense grids) — it reads as fake at this scale.
- Show headline features working (a real example task/result), not slogans.

## Tests

- Contract tests pin copy, structure, and cross-file consistency — when a
  change alters what they pin, update them **in the same PR** and note it
  in the PR body. Deleting a surface deletes/updates its pinning suites in
  the same PR.
- E2E specs (`tests/e2e/`) describe user-visible flows; keep them aligned
  with the same changes.
- Suites can't run in every environment — a PR that couldn't run its
  affected suites says so plainly in its body.
