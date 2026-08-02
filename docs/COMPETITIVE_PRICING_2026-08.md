# Competitive pricing snapshot — August 2026

Dated market baseline for the next `FOUNDER_CATALOG_VERSION` decision. Current
catalog economics live in `src/lib/plan-catalog.ts` and
[PRICING_DECISION_2026-07-25.md](./PRICING_DECISION_2026-07-25.md); this file
records what the market charged when catalog v6 was live so future pricing
decisions argue against evidence, not memory. Verified 2026-08-02 against the
linked official pages (third-party sources are marked).

## Infrastructure layer (per-minute usage)

| Vendor | Entry price | Effective rate | Packaging unit | Free tier | Source |
| --- | --- | --- | --- | --- | --- |
| Vapi (Wireline's upstream) | $0 platform sub | $0.05/min platform fee + providers at cost; 10 concurrent lines, then $10/line/mo | Per minute | Trial credits | <https://vapi.ai/pricing> |
| Retell AI | $0 | $0.07–$0.31/min all-in; numbers $2/mo | Per minute | $10 credit | <https://www.retellai.com/pricing> |
| Bland | $0 platform | $0.14/min (Start) → $0.12 + $299/mo (Build) → $0.11 + $499/mo (Scale) | Per minute, declining | Credits + free inbound number | <https://www.bland.ai/pricing> |
| ElevenLabs Agents | $5/mo | ~$0.08–$0.12/min by tier; overage up to $0.60/min on low plans | Bundled minutes | Yes | third party: cekura.ai |
| OpenAI gpt-realtime (SIP) | usage only | ~$0.30/min audio (flagship); mini ≈ 1/3 | Per token | No | third party: windowsnews.ai |

## Application layer (SMB packaging)

| Vendor | Entry price | Effective rate | Packaging unit | Free tier | Source |
| --- | --- | --- | --- | --- | --- |
| Wireline (this catalog) | $19/mo | $0.317–$0.353/min included; $0.22/min prepaid top-up | Agents + guaranteed minutes | Free Builder (draft only) | `src/lib/plan-catalog.ts` |
| Goodcall | $79/agent/mo | Unlimited minutes; 100–500 unique customers, then $0.50/customer | Per agent | No | <https://www.goodcall.com/pricing> |
| Rosie | $49/mo (250 min) | $0.196 → $0.149/min | Minute bundles, declining | 7-day trial | <https://heyrosie.com/pricing> |
| Smith.ai AI Receptionist | $0 (25 calls) | Pro $150/mo, 75 calls (~$2.00/call) | Per call | Yes | <https://smith.ai/pricing/ai-receptionist> |
| Slang.ai | $399/location/mo | Restaurant-only | Per location | No | <https://www.slang.ai/pricing> |
| Synthflow | $30k/yr contracts | Exited SMB self-serve entirely | Enterprise contract | No | <https://synthflow.ai/pricing> |
| Air.ai | ~$25k+ upfront | ~$0.20–$0.40/min (third party) | License | No | third party: lindy.ai |
| Budget band (AIRA, Dialzara) | $24.95–$29/mo | Bundled minutes | Subscription | Varies | third party: getaira.io |

## Standing observations for the next catalog decision

- **The market's converged units are per-minute (infra), per-agent, per-call,
  per-location, and minute bundles — not seats.** Wireline's genuinely
  market-beating unit is the extra agent: $15/mo including a number slot and 50
  guaranteed minutes, vs Goodcall's $79–$249 per agent.
- **Competitor ladders get cheaper per unit at higher tiers; Wireline's top
  tier is its most expensive per included minute** ($0.353/min on Business vs
  $0.317 on Starter). Any future capacity increase must clear the two-floor
  margin policy in `plan-catalog.ts` — the enterprise-annual hard-floor slack
  was ~$0.44/mo at v6 rates, so more minutes require repricing, cheaper COGS,
  or reserving fewer number slots.
- **Free live trial is now table stakes at the infra layer** (Retell $10
  credit, Bland free credits + inbound number) and common at the app layer
  (Rosie 7-day). Free Builder's draft-only posture is the conversion-funnel
  gap to revisit; a bounded owner-verified live allowance (5–10 min, worst
  case ~$0.64–$1.28 COGS per signup at the $0.128/min reserve) is the obvious
  experiment.
- **Vapi is both supplier and competitor.** Wireline's $0.22/min prepaid
  top-up sits above Vapi's $0.05/min platform fee plus pass-through costs;
  the margin story depends on the blended reserve staying near $0.128/min,
  and Twilio ConversationRelay ($0.07/min GA, BYO-LLM) is the documented
  contingency orchestration path if Vapi pricing or reliability shifts.
- **Demand-side urgency is new:** Google's "Ask for Me" has its AI call
  local businesses for quotes and publicly ranks the ones that do not answer;
  AI-originated calls to SMBs now come from every direction. "An unanswered
  call is now a public ranking penalty" is a time-sensitive marketing angle
  competitors' pricing pages do not use yet.

Refresh cadence: re-verify alongside the Compare page freshness window
(`tests/sales-trust-copy-contract.test.ts`, 45 days) or at the next catalog
rotation, whichever comes first.
