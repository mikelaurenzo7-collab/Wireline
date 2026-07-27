# Launch Readiness Fine-Tune — 2026-07-27

Status: **Active** — deep E2E audit across code, product honesty, security residuals, and Vercel ops. Verified wins shipped on this branch; residual ops items called out explicitly.

**Baseline:** `main` after voice-agent positioning PRs (`7562062b` lineage)  
**Branch:** `cursor/launch-readiness-finetune-6dd0`

## Executive result

Wireline remains a strong controlled-beta / founder-led launch candidate. Prior Round-4/5 remediations (token atomicity, enrichment isolation, Stripe allowance retry, MCP RLS, dial-gate honesty) are on `main` and contract-pinned. This pass found and fixed additional verified honesty, security-defense, and product-truth gaps, plus one production env correction.

**Do not declare unconditional GA** until federal DNC vendor credentials are real and one live $19 checkout has been exercised end-to-end. Browser errors already report via `/api/health/report` → server `SENTRY_DSN`.

## Code fixes shipped

### Honesty / API truth

1. **`GET /api/carrier/numbers` empty-success** — missing `VAPI_PRIVATE_KEY` now returns **503** instead of `200 { numbers: [] }`.
2. **AdminSettings** — no longer coerces phone/agent failures (or `degraded: true` 503 payloads) into empty inventories; carrier sync toasts on non-OK.
3. **OutcomeLedger / ApprovalInbox / IntakeKeysManager** — non-OK fetches surface errors instead of silent empty lists.
4. **VoiceReliabilityView / Call analytics** — latency recent + analytics tab no longer collapse failures to empty success.
5. **Onboarding `has_voice` / settings `has_vapi_key`** — stopped reading the dead tenant `vapi_private_key` column; report managed platform `VAPI_PRIVATE_KEY` + tenant number binding.

### Security residuals

6. **OAuth state nonce single-use claim** — `verifyAndClaimOAuthState` claims the embedded nonce via Upstash Redis (`SET NX`) after HMAC+TTL verification. All 14 integration OAuth callbacks **and** Google/Microsoft/Yahoo sign-in callbacks updated. Replay of a captured callback URL within the 20-minute TTL is blocked when Redis is available.
7. **Unsafe proactive enrichment dead path** — `job-worker-base.ts` no longer contains the phone-only cross-tenant history reads; it hard-throws if the intercept is ever removed (#879 landmine closed).

### Product / UX polish

8. **Anonymous session probe** — `GET /api/auth/session` returns `200 { user: null }` instead of `401`, silencing public-page console noise. CookieConsent now keys off `body.user`, not bare `ok`.
9. **Voice-agent copy alignment** — verification email, Compare meta, Client Apps, Privacy Policy, StudioWorkroom fallback, and Call Logs fallback use **AI voice agent** on broad/default surfaces.
10. **Docs index** — promoted `ONE-AGENT-STRATEGY.md` to Active (was Active-status but only historically linked).

### Contracts

- `tests/launch-readiness-finetune-2026-07-27-contract.test.ts` pins every fix above.

## Vercel / ops audit (token-verified)

| Item | Finding | Action this pass |
| --- | --- | --- |
| `WIRELINE_LAUNCH_DEMO_MODE` | Was still on Production (prior audits); tags product events as demo | **Set Production to `false`** |
| `FEDERAL_DNC_API_KEY` | **Absent** on all targets (URL+provider present) | Cannot invent vendor `loginId` — marketing outbound stays fail-closed until business registration |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | **Both absent** (prior docs claimed backend DSN; not in project env now) | Needs a real Sentry project DSN — not inventable here |
| Upstash Redis | Present on Production | Powers rate limits + new OAuth nonce claims |
| Core AI / Twilio / Vapi / Stripe / Resend / DB | Present on Production | Unchanged |

## Verified clean (no change needed)

- Round-5 token atomicity, enrichment intercept, Stripe allowance preflight still present + contracted.
- Outbound dial/SMS paths still converge on `evaluateOutboundDialGate`.
- Federal DNC fail-closed for marketing when vendor unset.
- Activation / entitlement fail-closed to `pending_activation`.
- Public pricing catalog truth ($19 / $39 / $79 / $159).

## Still open (ops / founder, not code-blockable)

1. Register business + set real DNCScrub `FEDERAL_DNC_API_KEY` (`loginId`) on Production/Preview/Development → `npm run dnc:probe`.
2. ~~Add `SENTRY_DSN`…~~ **Done** — Production/Preview/Development `SENTRY_DSN` from `revaluate/wireline-backend`. Browser errors already report via `/api/health/report` → server DSN (`VITE_SENTRY_DSN` is not an app code consumer).
3. One live Starter checkout → webhook → entitlement → portal → refund.
4. Restore GitHub Actions spending so CI is a real gate again.
5. Rotate the personal Vercel token pasted into chat after this session.
6. Optionally rename the live Stripe product from legacy “Conversation Balance” to “Runtime Balance” via catalog sync (`scripts/setup-stripe-catalog.mjs` accepts both names).

## Deep pass (same day)

Additional verified fixes after a fiercer second pass:

1. **Phone claim + search capacity gate (P0)** — `/api/phone-numbers/claim` and `/search` now enforce `getIncludedPhoneLineSlots` (search before buy; claim under identity lock).
2. **Provision TOCTOU (P0)** — `provisionTenantNumber` re-checks capacity under lock after carrier buy and compensates the loser.
3. **Assistants seed retired (P1)** — uncapped 5-agent insert returns `410 FLEET_SEED_RETIRED`.
4. **Meta OAuth page fetch honesty (P2)** — non-OK `/me/accounts` fails the callback instead of storing empty `page_ids`.
5. **Stripe allowance preflight claims `stripe_events` (P2)** — idempotent claim/mark/release before ACK.
6. **Sentry env honesty** — `VITE_SENTRY_DSN` removed from prod-env optional list; browser errors ride `SENTRY_DSN` via `/api/health/report` (already wired).
7. **Onboarding funnel** — `onboarding_create_redirect` product event on the create shell.

Contract: `tests/launch-readiness-deep-pass-2026-07-27-contract.test.ts`.

## Triple pass (same day)

1. **Account delete CTA (P0)** — Settings Danger Zone now POSTs `{ confirmation: "DELETE" }` and tells the truth about the 30-day grace (no fake completion email).
2. **Admin delete copy honesty** — scheduled purge + billing continues until then.
3. **Email suppressions live (P0 CAN-SPAM)** — applied `wireline_email_suppressions` + RLS/grants on shared Supabase; committed `0116_email_suppressions_live.sql`.
4. **TrialGate annual checkout** — passes stored `preferredBillingInterval` and shows `/yr` prices.
5. **StripeBillingCard** — annual Subscribe disabled unless `annual_configured`.
6. **Support/Contact honesty** — 503 when Resend fails; clients require `sent: true`.
7. **Phone bind activation gate** — `POST /api/phone-numbers` uses `enforceLiveWorkActivation`.
8. **Checkout customer race** — advisory lock around first Stripe customer create.
9. **Runtime Balance** — agent knowledge plan name no longer says Conversation Balance.

Contract: `tests/launch-readiness-triple-pass-2026-07-27-contract.test.ts`.

## Quadruple pass (same day)

1. **OAuth provider revoke (P1)** — disconnect paths and GDPR external release now best-effort revoke grants at Google / Microsoft / Slack / HubSpot / Salesforce / Zoom / Meta / X / Shopify / Square / Yahoo before local token delete.
2. **Mailbox disconnect honesty** — email account delete revokes tokens and cleans the matching calendar row for Google/Microsoft.
3. **Portal plan-switch fingerprint (P1)** — managed Stripe portal configs key off catalog version **and** a price/product fingerprint so upgrade/downgrade choices cannot go stale inside one founder catalog version.
4. **CRM disconnect UI honesty (P2)** — `CrmConnectionCard` checks `response.ok` and surfaces errors.
5. **Runtime Balance copy** — buyer-facing wedges, showcase, voice pricing, Stripe founder catalog product name, and ledger `customerReason` strings use Runtime Balance.

Contract: `tests/launch-readiness-quadruple-pass-2026-07-27-contract.test.ts`.

