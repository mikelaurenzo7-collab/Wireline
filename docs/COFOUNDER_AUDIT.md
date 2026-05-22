# Wireline Co-Founder Audit

**Date:** 2026-05-21  
**Standard:** Launch-ready, multi-million-dollar SaaS — beat Bland, Retell, Vapi roll-your-own, and horizontal “AI receptionist” clones on **reliability, integrations depth, and operator UX**.

---

## Executive summary

Wireline is not a demo. It is a **full-stack voice operations platform**: Vapi voice network, Claude brain, triage inbox, fleet training, CRM/OAuth mesh, billing, and a distinctive warm editorial brand. The codebase is **large (370+ TS/TSX files), tested, and deployed** (`trywireline.com`).

**Conviction thesis:** Operators do not buy “a voice bot.” They buy **answered calls + booked revenue + CRM truth + team alerts** with zero Frankenstein integrations. Wireline’s moat is **one console for every conversation channel** with agents that **act** (calendar, email, CRM, Slack, Teams, Shopify) — not just talk.

**Gap to immaculate:** Remaining wins are Insights latency dashboard, E2E golden paths in CI, and enterprise SSO — core operator UX, voice latency caps, compare page, and marketing demo seed are in production as of `7f256b8`+.

---

## Product surface (what we ship)

| Area | Routes / entry | Maturity |
|------|----------------|----------|
| Auth + sell | `/` → `AuthPortal` | Strong — demo directory, sign-in above fold |
| Command center | `/` (signed-in) | Strong — live monitor, actions, onboarding |
| Triage | `/triage` | Strong — hot leads, tasks, escalations |
| Channels | `/logs`, `/inbox`, `/sms`, `/outbound` | Production |
| Agents & train | `/agents`, `/train` | Production |
| Integrations | `/integrations` | Production — 10+ OAuth providers |
| Insights | `/insights` | Production — funnel, attribution, AI spend |
| Admin | `/admin` | Owner — branding, carrier, billing |
| Public trust | `/pricing`, `/compare`, `/changelog` | Marketing-ready |

---

## Voice AI vs competitors

| Capability | Wireline | Typical competitor |
|------------|----------|-------------------|
| Tool execution during call | Parallel tools + fail-open supervisor | Often sequential / brittle |
| Tenant-gated tools | `tenant-integration-connections.ts` | Often all-or-nothing |
| Voice persona | `voice-agent-profile.ts` + factory | Generic prompt only |
| Post-call intelligence | Triage, insights, coaching | Basic transcript |
| Human escalation | Triage + cockpit + win alerts | Email-only |

**Next voice wins:** Cap parallel tool fan-out; trim assistant payload size; bound supervisor latency; expose latency + tool success in Insights.

---

## Integrations mesh

**Connected in product:** Google/Microsoft/Yahoo mail, Salesforce, HubSpot, Slack, Zoom, Apollo, Meta Lead Ads, Shopify, Square, Microsoft Teams, Excel, Stripe, Twilio, DocuSign (platform-flagged).

**Architecture:** `integrations-registry.ts` (deployment), `tenant-integration-connections.ts` (per-tenant), `CrmConnectionCard` (UI), `oauth-routes.ts` + `vapi-routes.ts` (runtime).

**Next integration wins:** Integration health summary on hub; webhook delivery status; “last sync” per connector; Zapier/Make as distribution (strategic).

---

## Design system

- **Brand:** Warm cream `#EFE9DC`, silky purple `#4F1E7B`, Instrument Serif display.
- **Shell:** `AppShell` + `TopBar` + `BottomNavBar` (mobile) + `PageShell` + `Panel`.
- **Mobile:** Segmented tabs, panel stack, safe areas, 44pt targets.
- **QA:** `npm run qa:design-screenshots` — 390 / 1366 / 1920 with API mocks.

---

## Security & reliability

- Auth: Supabase session + `authFetch`, tenant isolation tests.
- Webhooks: Vapi secret validation (prod-enforced).
- Rate limits, audit log, DNC, TCPA consent modules present.
- Test suite: Vitest across lib + components.

---

## Top 15 prioritized gaps

1. **Production deploy discipline** — Git `main` → Vercel production auto-promote.
2. **PageShell headers** — titles/eyebrows visible (addressed).
3. **Integration card styling** — static Tailwind maps (addressed).
4. **Voice tool payload size** — assistant factory limits.
5. **Parallel tool concurrency cap** — protect p95 latency.
6. **AI Gateway migration** — cost tags + failover (Vercel skill path).
7. **E2E golden paths** — `npm run e2e:golden` in CI.
8. **Compare page** — sharpen vs Bland/Retell/Synthflow with honest tables.
9. **Onboarding time-to-first-call** — measure & advertise `<10 min`.
10. **Mobile horizontal overflow** — design QA script catches regressions.
11. **Email Yahoo** — finish inbox sync or clearer UX (already “soon”).
12. **Meta Lead Ads** — beta → stable with webhook tests.
13. **SOC2 narrative** — audit panel + RBAC docs for enterprise.
14. **Latency dashboard** — p50/p95 call + tool RTT in Insights.
15. **Loop tick** — overnight agent triage (`docs/loop-ticks/wireline-ai-tick.md`).

---

## Quick wins (this session)

- PageShell editorial headers (desktop + mobile).
- CRM integration card color tokens + responsive grid + manual refresh.
- Integration hub connection summary strip.
- Mobile/desktop CSS polish (glass, tabs, bottom nav).
- Design showcase screenshots script + mocks.
- Voice: max 3 parallel tool calls, 18k prompt cap, directive/knowledge injection.
- Compare: 13-row honest matrix + Bland/Retell/Vapi DIY positioning.
- Marketing demo `composer.demo@trywireline.com` seeded (24 calls, 18 leads, 8 appts, 6 KB).
- Auth portal one-click marketing email fill.
- Vitest: `vapi-tool-results.test.ts`, `vapi-prompt-budget.test.ts`.
- Vercel promote script uses `/v1/.../promote` (v10 422 on staged builds).

---

## Strategic (multi-day)

- Vercel AI Gateway for all LLM traffic.
- Zapier integration + template library.
- Enterprise SSO (Entra) + SCIM.
- White-label agency mode (branding panel → multi-tenant).
- Vertical playbooks as installable agent packs.

---

## Success metrics (how we know we won)

- **Activation:** Median time to first inbound call < 10 minutes.
- **Retention:** Weekly active operators / paid seats > 80%.
- **Quality:** Post-call book rate ↑, escalation rate ↓.
- **Brand:** Design QA zero horizontal-overflow failures on mobile.
- **Revenue:** Growth plan ARPU + expansion via agents/minutes.

Wireline wins when operators **trust the fleet** — visually, technically, and on the phone.
