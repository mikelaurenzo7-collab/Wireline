# Wireline Forward Plan — July 2026

**Status: historical.** Thin early roadmap superseded in detail by
`WIRELINE_LEVEL_UP_MASTER_PLAN.md`. **Last audit:** 2026-07-07 · **Branch
baseline:** `main`

## North star

Wireline wins as the **voice AI business operating system** for people, teams, and businesses that need phone agents to answer, qualify, route, book, follow up, and record outcomes. Current phase: **Horizon 0 — sell today** (prove activation and first paid conversion before distribution scale).

---

## Audit synthesis

### What is solid (keep)

| Area | Verdict |
|------|---------|
| Federal DNC wiring | Web, mobile, campaign dialer → `evaluateOutboundConsent` |
| Federal DNC fail-closed | Vendor configured + lookup error → block dial |
| CI / contracts | `verify-full` on `main`, 70+ contract tests, CodeQL |
| Product truth | Trust Center, Compare beta copy, voice $/min clarity |
| Launch readiness API | `GET /api/health/launch-readiness` for ops scorecard inputs |
| Visual QA CI | PR capture + P0 manifest gate across core routes |

### Still open (operational)

| Item | Owner | Gate |
|------|-------|------|
| Activation E2E proof | Founder | Signup → PSTN call → top-up; validate launch-readiness + billing |
| Federal DNC vendor credentials | Ops | `FEDERAL_DNC_API_URL` + `FEDERAL_DNC_API_KEY` in Vercel |
| Upstash Redis in production | Ops | Per `startup.ts` prod warning |

---

## Horizon roadmap

### Horizon 0 — code complete, ops proof pending

- [x] Trust Center, pricing clarity, outbound hub, product truth
- [x] Federal DNC hook, AuthZ governance, visual QA CI
- [ ] Activation E2E on production

### Horizon 1 — Use-case excellence (weeks 4–10)

Federal DNC vendor live, outbound analytics UI, learning loop GA, and broad GTM.

### Horizon 2 — Distribution (weeks 10–18)

Extension stores, iOS/Android store parity, ChatGPT App GA.

### Horizon 3 — Leadership (weeks 18+)

SSO, live supervisor audio, SDK, marketplace, ERP connectors.

---

## Agent directives

1. After new routes: `npm run authz:check` and commit matrix.
2. New dial surfaces: `isFederalDncListed` + `evaluateOutboundConsent`.
3. Ops metrics belong in health/observability APIs — not tenant Admin.

---

## Verification gates

`npm run authz:check` · `npm run verify:contracts` · `npm run verify:full` · `npm run visual:qa`
