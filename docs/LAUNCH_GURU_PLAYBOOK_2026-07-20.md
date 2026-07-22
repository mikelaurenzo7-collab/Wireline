# Wireline Launch Guru Playbook

Status: **Active** — founder cheat-code for a successful launch and durable future.
Canonical prices: `src/lib/plan-catalog.ts`. Canonical vendors: `docs/VENDOR_LAUNCH_MAP.md`.
Companion creative kit: `docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md` (binaries live in agent artifacts, not git).

Snapshot verified live on **2026-07-20 (evening hardening)**: Stripe on **Cadence AI** (`acct_1TkyXL8e6If87QKm`) available balance **$0.00**; Twilio balance **~$23.66**; production `trywireline.com` healthy; launch-readiness **83** (`compliance_ready` degraded). Federal DNCScrub still needs a real `loginId` on all Vercel targets (development key removed; prod/preview Sensitive values fail the runtime configured check).

---

## 0. One-page north star

| Item | Decision |
| --- | --- |
| Product | AI employees that call, text, email, follow up, and log outcomes |
| Domain | https://trywireline.com |
| Loop | **Create → Train → Wire → Run** (marketing: Brief → Train → Launch → Improve) |
| Spine | **Wire → Work → Win** |
| Hero | “Your next AI employee” / “The best employee you've ever had, for next to nothing.” |
| CTA | “Start free” → Free Builder → “Launch for $9/mo” |
| Money model | Included minutes + prepaid Conversation Balance (no silent postpaid meter; active calls finish) |
| Runtime | OpenAI → Gemini → AI Gateway; PSTN = Twilio → Vapi (GPT-4o → Gemini); Grok = auth live test only |
| Do not sell as GA | WhatsApp marketing, iOS/Android store, browser-extension stores, Jobber/ServiceTitan, SSO, auto-retrain, video presenter as core |
| Surface to launch | **Web only** — Command / MCP / Android / iPhone are optional companions, not admission criteria |

**Launch rule:** do not invite paying strangers until Stripe available balance is ≥ $0 and the live E2E matrix below is green.

**Perfectionism rule:** do **not** delay web launch for App Store, Play Store, Chrome/Firefox store listings, or iOS TestFlight. Ship the browser product; companions follow.

---

## 1. Go / no-go checklist (do in order)

### Red — block public checkout

1. **Federal DNCScrub** — set a real vendor `loginId` on Vercel (all targets). Until then,
   marketing outbound correctly fails closed. Prefer keeping Cadence AI Stripe; keep a
   **$300–500** available buffer before inviting paid users (balance is currently $0, not −$207).
2. **Prove billing E2E:** Checkout Starter $9 → webhook entitlement → Conversation Balance top-up → Customer Portal → cancel (access through period end).
3. **Prove voice E2E:** inbound answer + outbound dial + transfer/tool (`gemini_ground`) + call ends with logged outcome.
4. **Prove SMS E2E:** inbound reply + STOP/HELP compliance + delivery status callback.
5. **Prove email E2E:** Resend verify + password reset land in inbox for `trywireline.com`.
6. **Rotate secrets exposed in chat** (Vercel personal tokens pasted into agent sessions). Revoke old tokens after redeploy.
7. **`npm run vendor:readiness`** → treat `launch_ready` seriously; investigate any fail.

### Yellow — launch with caps

- Twilio Usage Triggers (daily + monthly).
- OpenAI / Vapi / xAI / Gemini / AI Gateway hard budgets + 50/75/90% alerts.
- Federal DNC funded before any marketing dial list.
- `WIRELINE_LAUNCH_DEMO_MODE=false` when first real customer is admitted.
- Dedicated `HEALTH_MONITOR_TOKEN` + monitor on `/api/health/launch-readiness`.

### Green — already true (2026-07-20)

- Vercel serves trywireline.com; Resend domain verified; Vapi inventory reachable; 9/9 Twilio numbers SMS → trywireline.com; Stripe catalog matches Founder Early Access; prepaid wallet model live.

---

## 2. Vendor map, API cost lanes, and recommended opening funds

Amounts are **recommended working capital to start**, not vendor list prices. Reconcile against each vendor dashboard weekly.

| Vendor | What burns money | Env vars (primary) | Recommended start fund / posture | Cap / alert |
| --- | --- | --- | ---: | --- |
| **Stripe** | Processing 2.9%+$0.30; Cadence AI live catalog | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLIC_KEY`, plan `STRIPE_*_PRICE_ID` | Available **$0** today — keep **$300–500** buffer before paid invites | Bank auto-debit on; Tax sub review monthly |
| **Twilio** | Numbers ~$1.15/mo COGS each; SMS; PSTN carrier | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `TWILIO_API_SECRET` | **$150–250** prepaid (today ~$24 — top up) | Daily trigger $25; monthly $200 until 20 paid accounts |
| **Vapi** | Call orchestration + model pass-through | `VAPI_PRIVATE_KEY`, `VAPI_WEBHOOK_SECRET`, `VITE_VAPI_PUBLIC_KEY` | **$200–400** or 2 weeks of expected minutes | Auto-reload on; concurrency ≥ expected peak+2 |
| **OpenAI** | Structured AI (GPT-5.6 Terra); Vapi GPT-4o; optional account-bound private simulation | `OPENAI_API_KEY`, optional `OPENAI_API_KEY_CHATKIT`, `OPENAI_REALTIME_*` | **$150–300** project budget month 1 | Soft 50/75; hard monthly stop |
| **Gemini** | Structured fallback + live research fallback | `GEMINI_API_KEY` | **$50–100** | Separate project budget |
| **Vercel AI Gateway** | Last multi-model route | `AI_GATEWAY_API_KEY` / OIDC | **$50** reserve + auto top-up | Monthly key budget |
| **xAI** | Auth Studio/sim live voice (not PSTN) | `XAI_API_KEY`, optional `XAI_API_KEY_CHATKIT` | **$50–100** | Cap; structured fallback stays **off** |
| **Perplexity** | Optional mid-call research | `PERPLEXITY_API_KEY`, `LIVE_RESEARCH_TIMEOUT_MS=8000` | **$0–40** until research demos matter | Optional |
| **Resend** | Transactional email | `RESEND_API_KEY`, `RESEND_FROM_*` | Free/Pro plan card on file | Domain keep verified |
| **Upstash** | Rate limits / spend controls | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Free → Pay-as-you-go when traffic grows | Required in prod |
| **Supabase** | Postgres + RLS | `POSTGRES_URL`, pool URL | Pro ~$25 card on file | No blind `db:push` on shared DB |
| **Vercel** | Hosting | project env | Pro ~$20 | Watch function/bandwidth |
| **Federal DNC** | Marketing scrub | `FEDERAL_DNC_API_URL`, `FEDERAL_DNC_API_KEY` | Credits for **2× first campaign list** | No marketing dial without scrub |
| **LiveAvatar / HeyGen** | Optional photoreal video presenter add-on | `LIVEAVATAR_API_KEY`, `HEYGEN_API_KEY` | Only if selling Live Video add-on | Never core PSTN; ElevenLabs removed |
| **LiveAvatar / HeyGen** | Video add-on $19/mo | `LIVEAVATAR_*`, `HEYGEN_*`, `STRIPE_LIVE_VIDEO_ADDON_PRICE_ID` | **$0** until add-on sold | Cap sessions |
| **Apollo** | Lead enrichment | `APOLLO_API_KEY` | **$0** until Lead Hunt monetized | Credit cap |
| **Sentry** | Errors | DSN optional | Free tier OK | Event quota |

### Blended COGS (code truth)

| Constant | Value | File |
| --- | ---: | --- |
| Voice variable COGS / min | **$0.128** | `plan-catalog.ts` |
| Phone number COGS / mo | **$1.15** | `plan-catalog.ts` |
| SMS customer charge / segment | **$0.02** | `sms-billing.ts` |
| Stripe processing model | **2.9% + $0.30** | `plan-catalog.ts` |
| Margin floor (full included util) | **45%** | `LAUNCH_CONTRIBUTION_MARGIN_FLOOR` |

### Minimum cash to open the gates (recommended)

| Bucket | Amount |
| --- | ---: |
| Stripe operating buffer | **$500** |
| Twilio + Vapi working capital | **$400** |
| OpenAI + Gemini + Gateway + xAI | **$350** |
| Infra cards (Vercel/Supabase/Upstash/Resend) | card on file (~$40–60/mo) |
| Ad test budget (optional week 1) | **$200–500** |
| **Total founder operating float** | **~$1,500–2,500** before scaling ads |

Do not solve anxiety with uncapped auto-spend. Prefer prepaid wallets + hard caps everywhere.

---

## 3. Pricing that protects long calls and your margin

**There is no 8-second call cap.** `LIVE_RESEARCH_TIMEOUT_MS=8000` is mid-call web-research latency only.

| Plan | Price | Agents | Included mins | Runtime Allowance | Overage (prepaid) | Numbers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Free Builder | $0 | 1 draft | 0 | $0 | — | 0 |
| Starter | $9 / $99 | 1 | 20 | $0.50 | $0.25/min | 1 |
| Starter Plus | $19 / $190 | 1 | 40 | $1 | $0.22/min | 1 |
| Pro | $59 / $590 | 5 | 100 | $4 | $0.19/min | 5 |
| Business | $149 / $1,490 | 15 | 250 | $10 | $0.17/min | 15 |

Add-ons: **+$15/mo** extra agent (+50 min +1 number); **+$19/mo** live video (Starter Plus+).
Top-ups: Conversation Balance **$5 / $10 / $25 / $50** (min $5, max $1000).

**Customer happiness rule:** active calls finish; depleted coverage blocks only the *next* action.
**Your happiness rule:** overage rates stay above $0.128 COGS; prepaid prevents surprise receivables.

Env-name gotcha: `STRIPE_TEAM_PRICE_ID` → Pro $59; `STRIPE_BUSINESS_PRICE_ID` → Business $149.

---

## 4. API call map (what each customer action costs you)

```
Inbound/Outbound PSTN
  Twilio (carrier) → Vapi (orchestrate) → OpenAI GPT-4o (+ Gemini fallback)
  + Deepgram STT (via Vapi)
  → Webhooks → voice-usage minutes → included pool → Conversation Balance

SMS
  Twilio Messaging → signed webhooks → $0.02/segment Conversation Balance

Studio live voice test (auth)
  xAI Grok realtime (NOT production PSTN)

Mid-call research tool
  Perplexity (optional) → Gemini grounded | timeout LIVE_RESEARCH_TIMEOUT_MS

Structured AI (train, summaries, tools off-call)
  OpenAI → Gemini → AI Gateway | Runtime Allowance then wallet

Artifacts (PDF/DOCX/XLSX/PPTX)
  Platform reserves $0.25–$0.50 from Runtime Allowance/wallet

Billing
  Stripe Checkout / Portal / webhooks → entitlements + ledger
```

Outbound marketing must pass `evaluateOutboundDialGate()` (TCPA, tenant DNC, federal DNC, quiet hours).

---

## 5. Step-by-step launch sequence (14 days)

### Days 0–2 — Money & truth

1. Confirm Cadence Stripe available ≥ $0 (today $0 — fund buffer before paid invites).
2. Top Twilio to ≥ $150; set Usage Triggers.
3. Confirm Vapi auto-reload; OpenAI/Gemini/Gateway budgets.
4. Rotate exposed Vercel tokens; verify prod env with `npm run check-prod-env` / vendor readiness.
5. Flip demo mode false only when ready for real tenants.

### Days 3–5 — Proof matrix

Run and record: signup → verify email → create AI employee → Wire number → inbound + outbound call → SMS STOP → billing checkout → top-up → cancel.

### Days 6–8 — Soft launch (design partners)

Invite **5–10** operators (home services, clinics, agencies, solo consultants). Offer Starter Plus personally; weekly 30-min feedback. Success metric: ≥1 booked outcome or recovered lead logged per partner.

### Days 9–14 — Public launch

1. Ship creative from media kit (hero, Wire→Work→Win, $9 CTA, prepaid trust).
2. Channels: LinkedIn founder narrative + X product clips + email to warm list + niche communities (no spam).
3. Ads: start **$20–50/day** on one offer (“Build free. Launch for $9.”) with landing `/signup?plan=starter` and `/pricing`.
4. Kill ads that don’t produce Free Builder → paid conversion within 7 days.

Expansion gate (from master plan): **20+ paying Team/Business** or **~$2k MRR** + 14 clean webhook/ledger days before heavy multi-surface push.

---

## 6. GTM cheat codes

### ICP (first wedge)

- Owner-operators with missed calls / slow follow-up.
- 1–20 person service businesses (HVAC, dental, clinics, agencies, local retail).
- Pain: “I need someone answering and following up tonight.”

### Positioning

- Sell **one AI employee**, not a bot farm.
- Lead with **included number + logged proof + prepaid spend control**.
- Never promise guaranteed profit, unlimited calls, or 7-day free trials.

### Funnel

`Content / ad → trywireline.com → Hear demo / Start free → Free Builder simulate → Launch $9 → Conversation Balance when minutes matter → Upgrade when concurrency needed`

### Content pillars (honest)

1. Multichannel one employee
2. Included number
3. Prepaid balance / no surprise overages
4. Sales desk / front desk modes
5. Owner controls (approvals, spend, consent)

### KPIs (week 1 / month 1)

| KPI | Week 1 | Month 1 |
| --- | ---: | ---: |
| Free Builder signups | 50 | 300 |
| Paid conversions | 5 | 30 |
| Activation (first live call) | 60% of paid | 70% |
| Gross margin on included mins | ≥45% model | observe COGS drift ≤$0.14/min |
| Support tickets / paid user | <0.3 | <0.2 |

---

## 7. Durable operating system (post-launch)

### Weekly

- Vendor balances (Stripe, Twilio, Vapi, OpenAI).
- COGS drift vs `$0.128` (`tenant-economics.ts` thresholds).
- Churn reasons; top failed webhooks.
- Creative: kill/scale ads.

### Monthly

- Number inventory prune (idle Twilio DIDs).
- Catalog vs Stripe price ID audit (`stripe:catalog:check`).
- Plan mix; Conversation Balance attach rate.
- Security: rotate keys; review authz matrix.

### Quarterly

- Re-price only if COGS + Stripe fees break 45% floor.
- Promote beta surfaces (mobile/extension/ChatGPT) only with clean metrics.
- WhatsApp only after ONLINE sender + templates + consent.

### Support posture

- Auto-refund ceiling `$50` (`SUPPORT_AUTO_REFUND_MAX_USD`).
- Human path: support@trywireline.com; sales@trywireline.com.
- Incident: `docs/INCIDENT_RESPONSE.md`.

---

## 8. Risk register

| Risk | Mitigation |
| --- | --- |
| Zero Stripe available buffer at checkout | Keep $300–500 buffer before paid invites |
| Voice COGS spike | Prepaid wallet; overage rates; pause new dials on hard gate |
| TCPA / DNC lawsuit | Outbound dial gate + federal DNC + consent logs |
| Secret leaks in chat | Rotate immediately; never commit tokens |
| Overclaiming beta surfaces | PRODUCT_SHOWCASE_MATRIX discipline |
| Margin death from “unlimited” | Never offer unlimited voice |
| CI phantom failure | Rely on `verify:full` + Vercel until Actions restored |

---

## 9. 90-day outcome targets

| Horizon | Target |
| --- | --- |
| Day 30 | Stripe green; 30 paid; activation ≥70%; no billing ledger incidents |
| Day 60 | $1k–2k MRR; Conversation Balance attach ≥25% of paid; first case study |
| Day 90 | Expansion gate hit; decide mobile/store push; WhatsApp still gated |

---

## 10. Related docs

- `FOUNDER_LAUNCH_COMMAND_CENTER.md` — daily go/no-go
- `VENDOR_LAUNCH_MAP.md` — inventory
- `BILLING_RUNBOOK.md` — Stripe proof
- `business-usage-pricing-decision.md` — call length vs research timeout
- `WIRELINE_LEVEL_UP_MASTER_PLAN.md` — phased execution
- `LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md` — creative inventory + copy
- `PRODUCT_SHOWCASE_MATRIX.md` — what you may claim
- `RUNNING_COSTS_AUDIT_2026-07-06.md` — infra bands

---

*Prices and env names change — re-verify against `plan-catalog.ts` and live Stripe before printing this for partners.*
