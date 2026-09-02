# BotBound Domain Audit

Date: 2026-08-31

Status: Point-in-time domain audit of `main` `bc2e32d6f80ab637e073b8829fb01060d5c1bf2e`, with complementary code landed in this review.

Live snapshot: `GET https://botbound.me/api/health` returned `{"ok":true}`. At the time, `GET /api/health/voice-status` returned `healthy` with `total_calls: 0` and `demo_line: true`; that public demo-line probe is now retired and no longer mounted. Launch-readiness remains monitor-token gated (401 without credential).

This file does not replace `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`, `docs/FOUNDER_LAUNCH_COMMAND_CENTER.md`, or `docs/PRODUCT_SHOWCASE_MATRIX.md`. Durable product conclusions were promoted into code. Concurrent PR #1186 already owns production sender override, fabricated public-stats retirement, founder PSTN canary quarantine, and GPT-5.6 metering.

## Executive verdict

| Motion | Verdict |
| --- | --- |
| Founder-led inbound design partners (3-5) | **CONDITIONAL GO** after one exact-head dogfood loop |
| Open self-serve paid acquisition | **HOLD** until one live checkout lifecycle |
| Cold / scaled marketing outbound | **HOLD** (federal DNC fail-closed by design) |
| Browser store / App Store / Play / MCP directories | **HOLD as early access or planned** |
| Live Video | **FREEZE retired** |
| Broad paid media | **HOLD** (creative/rights still a broadcast gate) |

The product is one Bot workspace for calls, texts, and email. The code spine exists. Remaining launch blockers are mostly live proof, not missing product surface.

## Domain verdicts

### Create / Build

**Live.** Role starters, identity marks, transactional create, capacity gates. The submitted brief can still fail after commit (`/api/train/extract` is a second request).

### Train

**Partial.** Knowledge upload and personality persist. Cards cannot edit or delete despite PATCH/DELETE APIs. Auto-retrain remains Planned.

### Wire

**Partial.** Paid Bots queue managed number and mailbox identity. Checkout return is generic `/settings/billing` without wizard continuation. AgentMail stays fail-closed without production domain/key.

### Run / Studio

**Partial.** Private browser test works. Studio Review is configuration review, not operational outcomes. Overview redirects to Studio; the activation checklist is stranded on the retired page.

### Inbox / email / SMS

**SMS: conditional GO** for low-volume consented traffic (STOP/HELP, tenant DNC, Redis failsafe). **Email: partial.** Managed inbound persists; there is no customer reply composer. Do not sell “calls, texts, and email” as a completed loop to the first partner unless email is scoped out.

### Voice / PSTN

**Conditional GO** for consented inbound design-partner calls. Runtime is OpenAI Realtime over Twilio SIP. No live Vapi/xAI phone path remains. P1: SIP webhook replay is not claimed before spend reservation; finalizer failures can be swallowed; the now-retired `/api/health/voice-status` probe reported healthy with zero current-runtime signal.

### Billing / margin

**Code PASS, live unproven.** Self-serve checkout is fail-closed until `WIRELINE_SELF_SERVE_BILLING_ENABLED` plus production `main`. Catalog v6 is coherent. Trust copy previously overstated an always-on hard cap.

### Auth / tenant / security

**Code PASS.** Custom scrypt + HIBP, HttpOnly cookies, `wireline_server` + `app.current_user_id`. Shared workspaces exist but stay disabled until certification. Tenant email suppressions still use permissive RLS. 105 unjournalled historical migrations are a greenfield/DR risk, not a current production defect.

### Public conversion / brand

**Conditional GO for founder-led traffic.** Aug 20 P1-01 (mobile hid the hero and defaulted to Sign In) is **superseded**. Canonical origin in source is `https://botbound.me`. Competing public spine **Build / Configure / Launch** is corrected in this review.

### Companions

Extension, iOS, Android, and MCP already use `botbound.me`. Keep them early-access/planned. Do not rename `com.trywireline/mcp` or Firefox `command@wireline.com`.

### GTM / business

First motion is 3-5 founder-led design partners with an obvious missed-call or follow-up problem. Open GitHub issues 1168, 562, 1006, 531, 744, and 1152 are mostly ops or superseded by current runtime policy. Stale open PRs should not be merged onto current `main`.

## What this review executed

Complementary to PR #1186:

1. Public operating loop is **Build → Train → Launch → Improve**.
2. Post-create wizard is **Train → Test → Launch**, so private rehearsal happens before paid number provisioning.
3. `agent_launch_completed` emits only when a line exists and a test started.
4. Unsubscribe mailto defaults to `unsubscribe@botbound.me`.
5. Unconfigured Google/Microsoft connect-start returns 503 without env-var names.
6. Trust Pack spend and recording claims match actual enforcement.

## Founder-ops only (do not code around)

- One exact-head paid checkout → webhook → entitlement → portal loop.
- One consented non-demo inbound call and follow-through.
- AgentMail production domain/key, Stripe BotBound identity, OAuth callback cutover.
- Federal DNC vendor credential before any marketing outbound.
- Exact-head `botbound.me` visual QA of authenticated surfaces.

## Freeze

Live Video, competing public spines, manufactured adoption counts, WhatsApp GA claims, xAI as a customer runtime, blanket Vapi identifier deletion (`vapi_call_id` still stores provider call IDs), and store/directory launches before the first dogfood loop.
