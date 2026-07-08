# Code Review Master Plan — 2026-07-06

Status: **Executed** — verified findings implemented; July 2026 forward pass completed.

## Verified critical / high findings (executed)

| # | Severity | Surface | Issue | Status |
| --- | --- | --- | --- | --- |
| 1 | High | Web/API | Platform admin `/api/health/slos` returned tenant snapshot | **Done** — `getPlatformSloSnapshot` |
| 2 | High | Web/API | Monitor-token SLO path omitted job/webhook measurements | **Done** — platform aggregate |
| 3 | High | Web/API | Stripe webhook idempotency fails open on DB errors | **Done** — fail closed (503) |
| 4 | High | Browser | Forgeable `#browser-context=` auto-opens create dialog | **Done** - opaque one-time `/studio/handoff` bridge |
| 5 | High | ChatGPT MCP | Live agents mutable via draft tools | **Done** — phone-line guard |
| 6 | High | Native | Outbound dial blocked by TCPA (`hasExpressWrittenConsent` never sent) | **Done** — Android/iOS UI + API |
| 7 | High | Android | FCM device registration never runs post sign-in | **Done** — `refreshPushRegistration` |
| 8 | Medium | Web/API | `appointment_scheduler` rejected on create | **Done** — legacy alias normalize |
| 9 | Medium | Docs | AUTHZ matrix over-allowlists `/api/health/*` | **Done** — narrow allowlist |
| 10 | Medium | Docs | OpenAPI lists `/api/agents/roles` as public | **Done** — bearer security |

## July 2026 forward pass (executed)

| Item | Status |
| --- | --- |
| Stripe live retired default price deactivation (5 legacy SKUs) | **Done** — `npm run stripe:deactivate-retired-defaults`; post-audit **0 findings** |
| MCP OAuth hardening (resource binding, refresh rotation, rate limits, Cursor callbacks) | **Done** |
| Opaque one-time browser handoff (`/studio/handoff` exchange/redeem) | **Done** |
| Web outbound dial + TCPA on Overview, Studio, Phone | **Done** |
| Post-create wizard persistence across refresh | **Done** — sessionStorage step keys |
| Activation instrumentation (`agent-created`, `first-call-made` GTM aliases) | **Done** — `product-event-client.ts`; `ActivationNudge` mounted in workspace shell |
| iOS CallKit answer → handoff semantics | **Done** — auto-handoff on CallKit answer |
| Extension handoff bridge + policy `--check` | **Done** — manifest `0.1.1` (store republish pending) |
| Legacy Google Drive ingest (`drive-routes`, `google-drive-sync`) | **Deleted** — v2 path via `google-drive-sync-v2` retained |
| Daily Brief / Insights routes | **Mounted** — removed from `tsconfig` exclude |
| Launch readiness + margin scorecard | **Partial** — `GET /api/health/launch-readiness` + observability dashboards; dedicated ops UI deferred |

## Deferred (documented)

| Issue | Reason |
| --- | --- |
| Auth rate-limit fail-open without Redis | **Mitigated** — Upstash on all Vercel targets |
| Vapi v1 folder deletion | Production uses `vapi-v2`; legacy folder still excluded pending full port |
| Android local `assembleDebug` | No JDK on dev machine; CI workflow remains gate |
| Browser extension store republish | Build verified; Chrome Web Store submission is manual |
| Launch readiness API + observability | See `docs/WIRELINE_FORWARD_PLAN_2026-07.md` and `docs/LAUNCH_READINESS_AND_MARGIN.md` |

## Verification gate (2026-07-07)

| Check | Result |
| --- | --- |
| `npm run stripe:audit-live` (post-deactivation) | **0 findings** |
| Vercel env health | **CORE READY** |
| Production `/api/health` | **200** |
| Production `/api/health/public` | **200** operational |
| Extension `build.mjs --check` | **Passed** |
| `npm run verify:full` | Run on merge commit |

## Stripe live audit (post-deactivation)

Retired products (Concierge, Household, Plus, Everyday, Custom) now use `$0 retired_anchor` default prices only. Launch catalog unchanged: Conversation Balance, Personal, Team, Business, Enterprise, Live Video.
