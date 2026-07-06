# Code Review Master Plan — 2026-07-06

Status: **Executed** — verified findings implemented; deferred items documented below.

## Verified critical / high findings (executed)

| # | Severity | Surface | Issue | Status |
| --- | --- | --- | --- | --- |
| 1 | High | Web/API | Platform admin `/api/health/slos` returned tenant snapshot | **Done** — `getPlatformSloSnapshot` |
| 2 | High | Web/API | Monitor-token SLO path omitted job/webhook measurements | **Done** — platform aggregate |
| 3 | High | Web/API | Stripe webhook idempotency fails open on DB errors | **Done** — fail closed (503) |
| 4 | High | Browser | Forgeable `#browser-context=` auto-opens create dialog | **Done** — no auto-open; URL sanitized |
| 5 | High | ChatGPT MCP | Live agents mutable via draft tools | **Done** — phone-line guard |
| 6 | High | Native | Outbound dial blocked by TCPA (`hasExpressWrittenConsent` never sent) | **Done** — Android/iOS UI + API |
| 7 | High | Android | FCM device registration never runs post sign-in | **Done** — `refreshPushRegistration` |
| 8 | Medium | Web/API | `appointment_scheduler` rejected on create | **Done** — legacy alias normalize |
| 9 | Medium | Docs | AUTHZ matrix over-allowlists `/api/health/*` | **Done** — narrow allowlist |
| 10 | Medium | Docs | OpenAPI lists `/api/agents/roles` as public | **Done** — bearer security |

## Additional native hardening (executed)

| Item | Status |
| --- | --- |
| Android role catalog from `/api/mobile/agents/roles` | **Done** |
| Android `deferPhoneProvision` removed from create | **Done** |
| Android `EncryptedSharedPreferences` for session token | **Done** |
| iOS sign-out clears server session + unregisters device | **Done** |
| Contract tests: TCPA, draft live guard, platform SLO | **Done** |

## Phase 2 — Design / UX polish (executed)

| Item | Status |
| --- | --- |
| Canonical outbound consent copy (web module + native constants) | **Done** |
| TCPA consent UI: help text + Learn more → `/trust/legal` | **Done** — Android + iOS |
| Android role picker loading state | **Done** |
| iOS role catalog from `/api/mobile/agents/roles` | **Done** |
| Browser handoff fragment TTL (10 min) | **Done** |

## Deferred (documented, not in this pass)

| Issue | Reason |
| --- | --- |
| Signed browser handoff tokens | Requires server handoff endpoint + extension release |
| Auth rate-limit fail-open without Redis | Infra/config — enable Upstash in prod |
| MCP token resource backfill + refresh revocation | OAuth migration window |
| iOS CallKit answer vs handoff semantics | Native UX pass |
| Android Gradle version catalog / cleartext traffic audit | Native release track |
| Stripe live catalog deactivation | Requires `STRIPE_SECRET_KEY` + owner approval |

## Verification gate

| Check | Result |
| --- | --- |
| `npm run verify:full` | **Passed** (320 tests) |
| Vercel env health (`check-vercel-env-health.mjs`) | **CORE READY** — Upstash on all targets |
| Production `/api/health` | **200** `ok: true` |
| Production `/api/health/public` | **200** operational |
| Stripe live audit (`npm run stripe:audit-live`) | **Warnings only** — 5 legacy default prices on retired products (no deactivation without approval) |
| Supabase security advisor | **1 WARN** — enable leaked-password protection |
| Android `assembleDebug` | Blocked — no JDK on machine |

## Stripe live audit inventory (2026-07-06)

**Active launch catalog (expected):** Conversation Balance, Wireline Personal/Team/Business/Enterprise, Wireline Live Video — 13 launch-active prices, 0 live subs on retired SKUs.

**Owner approval required before deactivation** (default prices on retired products):

| Product | Price nickname |
| --- | --- |
| Wireline Concierge | Operator — Monthly ($59/mo) |
| Wireline Household | Studio — Monthly ($29/mo) |
| Wireline Plus | Plus — Monthly ($15/mo) |
| Wireline Everyday | Everyday — Monthly ($7/mo) |
| Wireline Custom | Scale — Monthly ($699/mo) |

**Operational scripts:** `npm run stripe:audit-live` (requires `VERCEL_TOKEN`).
