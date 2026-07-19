# Founder Launch Command Center

Status: **Active owner runbook and go/no-go index**. Code and canonical linked
documents win when a number or status changes.

## Executive decision

Wireline keeps Personal and Business workspaces:

- Personal creates a **personal agent**.
- Business creates an **AI employee**.
- Technical/API surfaces keep `agent`.

See `docs/CUSTOMER_TERMINOLOGY.md`.

Do not move the launch runtime to ElevenLabs. ElevenLabs is optional TTS,
cloning, and showcase infrastructure. Keep:

1. xAI Grok for structured reasoning and Studio realtime voice.
2. Twilio + Vapi for PSTN orchestration.
3. OpenAI with Gemini fallback inside the Vapi phone runtime.
4. Vercel AI Gateway as the funded last-resort structured route.
5. ElevenLabs as optional voice identity, not reasoning.

## Current go/no-go

### Red — resolve before taking live customers

- [ ] Rotate invalid Twilio production credentials; prove account status,
      number inventory, one SMS, inbound call, and outbound call.
- [ ] Resolve Stripe's negative $207.00 balance and failed bank withdrawals.
- [ ] Decide whether to retain the recurring Stripe Tax subscription that
      created two $103.50 balance transactions while MRR is $0.
- [ ] Replace malformed `FEDERAL_DNC_API_URL` with the actual HTTPS endpoint.
- [ ] Re-run `npm run vendor:readiness` until `launch_ready: true`.
- [ ] Rotate/set `HEALTH_MONITOR_TOKEN`; production monitor probe currently
      rejects the stored token.

### Green at audit

- Vercel production deployment is Ready and serves `trywireline.com`.
- Public health reports voice, fallback, and reasoning operational.
- Supabase is `ACTIVE_HEALTHY`; database health reports 74 tables, 196 indexes,
  and no issues/warnings.
- xAI, OpenAI, Gemini, Vapi, ElevenLabs, Resend, and Stripe API credentials are
  accepted.
- Resend domain `trywireline.com` is verified.
- ElevenLabs Creator is active with its full audited credit allowance unused.
- Stripe charges and payouts are enabled; catalog products are active; there
  are no active subscriptions.
- AI Gateway key, Upstash, Sentry, OAuth, MCP, Vapi, Stripe, DNC, and core
  encryption env names exist in Vercel.

## Funding cheat sheet

Use caps and alerts; never solve launch anxiety with uncapped auto-spend.

| Account                                         | Owner action                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Stripe                                          | Settle negative balance first. Confirm bank debit. Re-evaluate the Tax subscription before another renewal.   |
| Twilio                                          | Rotate credentials, confirm paid account/payment method, then add Usage Triggers for daily and monthly spend. |
| Vapi                                            | Hold at least two weeks of expected call cost, enable auto-reload, and confirm concurrency.                   |
| xAI                                             | Maintain prepaid credits or a nonzero invoiced limit; alert at 50/75/90%.                                     |
| OpenAI                                          | Add payment method, project budget, and hard/soft alerts; PSTN depends on this key.                           |
| Gemini                                          | Keep billing attached as inexpensive fallback; cap separately.                                                |
| AI Gateway                                      | Buy a small reserve, set auto-top-up, and enforce a monthly API-key budget.                                   |
| ElevenLabs                                      | No immediate top-up. Use existing Creator credits only for approved clones/showcase.                          |
| Federal DNC                                     | Fund enough scrubs for at least 2× the first campaign list. No marketing dial without a successful scrub.     |
| Supabase/Vercel/Upstash/Resend/Sentry/Plausible | Maintain plans and valid cards; these are subscriptions, not prepaid wallets.                                 |
| LiveAvatar/HeyGen/Apollo/Perplexity             | Leave capped or unfunded until the corresponding paid add-on is enabled.                                      |

Exact account state and executable probes live in
`docs/VENDOR_LAUNCH_MAP.md`.

## Runtime operating rules

### Structured work

`xAI Grok 4.5 → OpenAI → Gemini → Vercel AI Gateway`

- Do not route every request through the most expensive model.
- Keep Grok direct for the tested launch path and provider-specific realtime.
- Tag and budget Gateway usage before promoting it above last-resort status.
- Record provider, model, tokens, latency, feature, account, and cost for each
  paid action.

### Phone calls

`Twilio number → Vapi → OpenAI call model → Gemini fallback`

Speech: Deepgram Flux STT + managed Vapi TTS. Twilio supplies number,
messaging, and limited fallback behavior. ElevenLabs is not the tenant phone
default.

### Spend safety

- No paid provider action without entitlement or Conversation Balance.
- No automatic postpaid customer overage.
- Pause new paid actions when provider funding falls below the owner reserve.
- Finish active calls; block only the next paid action.
- Attribute vendor spend to customer, agent, feature, and call.

## Launch timeline

### T-7 operating gate

- Run `npm run verify:full`, `npm run vendor:readiness`,
  `npm run db:health`, `npm run stripe:catalog:check`.
- Complete Twilio, DNC, Stripe balance, and monitor-token red actions.
- Verify Resend signup, verification, reset, billing, and support mail.
- Run real inbound/outbound calls with transcript, summary, ledger, and webhook
  reconciliation.
- Confirm Trust Center claims match `docs/TRUST_CONVERSION_PACK.md`.

### T-24

- Promote the tested Vercel deployment per `DEPLOY.md`.
- Freeze schema/catalog writes.
- Confirm status page and support inbox ownership.
- Set provider alerts and cards-on-file.
- Prepare a rollback deployment and provider kill switches.
- Confirm DNC, consent, quiet-hours, recording, and caller-ID policy.

### Launch hour

- Start with founder/design-partner traffic, not broad paid ads.
- Watch health, Vapi/Twilio webhooks, Stripe events, signup email, model errors,
  call completion, and gross margin.
- Keep marketing outbound disabled until the DNC probe is green.
- Do not promote browser/native/MCP/video as generally available.

### H+2 / D+1

- Reconcile subscriptions, Conversation Balance, call costs, and provider
  invoices.
- Review failed/abandoned signups and first-agent completion.
- Listen to real call samples with consent.
- Fix funnel breaks before increasing traffic.

## KPI traffic lights

Pause paid acquisition on any red condition.

| Metric                                    |         Green |          Yellow |                           Red |
| ----------------------------------------- | ------------: | --------------: | ----------------------------: |
| Signup → first personal agent/AI employee |          ≥60% |          40–59% |                          <40% |
| First creation → first successful test    |          ≥50% |          30–49% |                          <30% |
| Paid activation → first live call         |          ≥70% |          50–69% |                          <50% |
| Completed-call rate                       |          ≥95% |          90–94% |                          <90% |
| Webhook reconciliation                    | 100% same day | recoverable lag |               unresolved >24h |
| Contribution margin                       |          ≥45% |          35–44% |                          <35% |
| Refund/dispute rate                       |           <2% |            2–4% |                           >4% |
| Support P0 response                       |       <15 min |       15–30 min |                       >30 min |
| DNC/consent coverage                      |          100% |             N/A | any marketing dial unscreened |

Pricing and margin inputs come only from `src/lib/plan-catalog.ts` and
`docs/P0_BILLING_OPS_NOTE.md`.

## GTM sequence

1. **Design partners:** one repeatable, high-value call job.
2. **Founder Early Access:** prove Create → Train → Wire → Run and support.
3. **Web launch:** sell outcomes, included number/capacity, control, and proof.
4. **Browser beta:** explicit page-context handoff only.
5. **Native beta:** urgent approvals, calls, notifications, wallet safety.
6. **ChatGPT/MCP beta:** drafting/simulation; no dialing or billing bypass.
7. **Video add-on:** only after consent, cost, demand, and fallback proof.

Expansion gate remains: repeatable paid accounts, clean webhook/ledger
reconciliation, and margin above floor.

## Positioning cheat code

### Personal

“A personal agent for the calls and appointments you keep putting off.”

### Business

“An AI employee that handles one customer-facing job across voice, SMS, and
email—and logs every outcome.”

### Proof order

1. One clear job.
2. One trained identity.
3. One reachable number on paid plans.
4. One visible outcome record.
5. Owner controls for spend, approvals, handoff, and compliance.

Do not lead with model names, “unlimited,” autonomous workforce hype, video
presenters, or a list of integrations.

## Compliance and trust

- Federal and tenant DNC checks before marketing outbound.
- Documented consent and opt-out handling.
- Quiet-hour and campaign caps.
- Recording disclosure according to jurisdiction and policy.
- STIR/SHAKEN/Trust Hub, Voice Integrity, and CNAM after Twilio is repaired.
- Never claim SOC 2 Type II certification until externally attested.
- Keep provider secrets and OAuth tokens server-owned/encrypted.
- Use custom-auth HIBP screening; the Supabase leaked-password advisor is not
  the active auth control.

Canonical references:

- `docs/TRUST_CONVERSION_PACK.md`
- `docs/COMPANY_IDENTITY_PACK.md`
- `docs/INCIDENT_RESPONSE.md`
- `docs/CLIENT_SURFACES.md`
- `docs/SLA.md`

## Incident / rollback tree

| Failure          | Immediate action                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Auth/database    | Stop acquisition, post status, rollback deploy if correlated, inspect Supabase/Vercel.             |
| Stripe           | Pause checkout/top-ups; do not alter ledger manually; replay verified webhooks after fix.          |
| Vapi/OpenAI PSTN | Pause new calls; preserve inbound fallback; post degraded status.                                  |
| Twilio           | Pause number/SMS provisioning; preserve Vapi-owned paths; rotate credentials if unauthorized.      |
| xAI              | Structured chain should move to OpenAI/Gemini/Gateway; disable Studio live voice if sessions fail. |
| DNC vendor       | Hard-stop marketing outbound. Inbound/support may continue.                                        |
| Resend           | Keep app available; surface verification/reset degradation and use support escalation.             |
| Bad release      | Promote previous Vercel production deployment; verify DB/catalog compatibility first.              |

## Owner dashboard

Daily:

- Vercel errors and latency
- Supabase health/connections
- Vapi failed calls/concurrency/credits
- Twilio auth, usage, delivery failures
- xAI/OpenAI/Gemini/Gateway spend
- Stripe negative balance, webhooks, checkout, disputes
- Resend bounce/domain status
- Sentry P0/P1
- DNC availability and blocked dials
- Signup → creation → test → activation funnel
- Gross margin by plan/account

Weekly:

- Provider invoices vs ledger
- Top failure reasons
- Call-quality review
- Refund/support themes
- CAC/payback by channel
- Expansion-feature demand

## Canonical command sequence

```bash
npm run vendor:readiness
npm run db:health
npm run verify:full
npm run stripe:catalog:check
node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com
node apps/browser-extension/scripts/build.mjs --check
```

No launch is “green” because the site renders. Green means the customer can
sign up, create, test, activate, call, receive the outcome, reconcile cost, and
get support without a hidden manual rescue.
