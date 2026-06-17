# Wireline Beast — product vision & north star

Read this **before every full run**. The beast is not a click map — it validates
whether Wireline delivers on its **moat** and **operator promise**.

## What Wireline is (ship bar)

Wireline is a **horizontal AI voice + email agent platform**: one fleet handles
inbound/outbound calls, SMS, and email, with a **live supervisor cockpit** and a
**self-improvement loop**. Single-tenant SaaS for businesses that run revenue and
compliance on the phone.

| Pillar | Operator should feel | Beast validates |
|--------|---------------------|-----------------|
| **Mission control** | Director is the spine; everything else is instrumentation | Chat works end-to-end; coach + approvals + fleet context |
| **Live floor** | See what's happening now; act without leaving ops | Ops floor, triage, proposed vs live actions |
| **Trust** | AI proposes; humans approve; audit trail exists | Proposal cards, DNC, audit log, clear live/proposed |
| **Fleet quality** | Agents improve from calls + coaching | Training, insights quality, coach mode |
| **Integrations** | CRM/Shopify/calendar are one sentence away | Director integration probes + marketplace UX |
| **Editorial craft** | Cream/velvet, calm, instrument-grade — not generic AI slop | design-bar.md on P0 surfaces |

## What "production-ready" means for Wireline

**NOT READY** if any of these fail:

1. An operator cannot **sign in → open Director → get a substantive reply** in one session
2. **Main content is clipped** under the sidebar at standard desktop width
3. **Approve/deny** flow is broken or invisible for execute probes
4. **Live vs proposed** actions are ambiguous on Ops/Actions
5. Director/Painter show **persistent data-load failure** on fresh threads
6. Mobile supervisor cannot **open Chat or Ops** and complete one action

**READY** when:

- [scorecard.md](scorecard.md) total ≥ **85** and no dimension below **3/5**
- All [operator-journeys.md](operator-journeys.md) **P0 journeys** pass
- [coverage.md](coverage.md) attempted with documented skips only
- Zero open **P0** bugs (fixed or user-accepted in writing)

## Competitive differentiation (must not regress)

Wireline wins when the product feels like **running a contact center with an AI
chief of staff** — not a chatbot in a purple box.

| Generic AI app | Wireline must show |
|----------------|-------------------|
| One chat thread | Director **+** Painter; coach-per-agent; fleet context |
| Text-only replies | Approvals, artifacts, research sources, live orchestra |
| Settings soup | Ops floor + triage + pipeline + channels in one shell |
| "Integrations" page | Director can **propose** CRM/calendar/Shopify actions |
| Stock empty states | Operator-specific copy; seeded demo feels like a real business |
| Flashy gradients | Paper & velvet; mission-control density where it matters |

Log regressions here as **MOAT** severity in the report (treated as P1 minimum).

## Personas (pick primary for the run)

| Persona | Job | Journey emphasis |
|---------|-----|------------------|
| **Founder** | "Is my fleet working? What do I fix first?" | J1 Morning command, J3 Fleet audit |
| **Ops lead** | "What's live? What needs me?" | J2 Floor hour, J4 Triage → contact |
| **Rev/sales** | "Move deals" | J5 Pipeline → Director execute |
| **Compliance/admin** | "Prove we followed rules" | DNC, audit, approval deny path |

State persona in report metadata. Full beast runs **Founder + Ops** minimum.

## Release gates

| Gate | Mode | Time budget | Pass |
|------|------|-------------|------|
| **Hotfix** | `regression` | 20–30 min | regression-watch + last P0 areas |
| **Weekly** | `journeys` | 60–90 min | All P0 journeys + Director minimum |
| **Launch** | `full` | 3–5 hr | coverage A–N + scorecard ≥85 |
| **Director-only** | `director` | 45–90 min | coverage §C + moat probes |

## Moat surfaces (ARCHITECTURE alignment)

When Director streams, validate **perceived intelligence tier**:

| UI signal | Meaning |
|-----------|---------|
| **Deep** / Opus badge active | Reasoning layer engaged — strategy probes |
| **Loading fleet context** | Prepare phase — fleet + thread hydration |
| **Live orchestra** / pipeline steps | Off-wire orchestration visible |
| **Proposal card** dashed rail | Execute layer — human in the loop |
| **Research sources** panel | Grounded search path worked |

Do not assert model IDs in UI — assert **operator-visible behavior** matches tier
intent (substantive strategy vs fast classification).

## Self-improvement loop (visual only)

Trace this chain in browser — any broken link is **MOAT** or P1:

```
Live call/email (Phone/Email) → Insights quality view → Training knowledge/flow
→ Coach in Director → proposed agent change (approval if mutating)
```

Full chain optional on hotfix; required on **Launch** gate.

## Artifacts the beast owns

| Path | Contents |
|------|----------|
| `terminals/dogfood-prod/dogfood-report.md` | Human report + scorecard |
| `terminals/dogfood-prod/scorecard.json` | Machine-readable scores |
| `terminals/dogfood-prod/screenshots/` | Named: `{viewport}_{route}_{issue}.png` |
| `terminals/dogfood-prod/journeys/` | Optional per-journey notes |

## Related

- [operator-journeys.md](operator-journeys.md) — scenario scripts
- [trust-moat.md](trust-moat.md) — approvals, compliance, differentiation probes
- [demo-contract.md](demo-contract.md) — seeded data expectations
- [scorecard.md](scorecard.md) — weighted readiness score
