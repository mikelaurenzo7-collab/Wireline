# Wireline Forward Plan — July 2026

**Status:** Active · **Last audit:** 2026-07-07 · **Branch baseline:** `main` after founder cockpit removal + governance remediation

## North star

Wireline wins as the **voice AI business operating system** for people, teams, and businesses that need phone agents to answer, qualify, route, book, follow up, and record outcomes. Current phase: **Horizon 0 — sell today** (prove activation and first paid conversion before distribution scale).

---

## Audit synthesis (health guardian + scorecard)

### What is solid (keep)

| Area | Verdict |
|------|---------|
| Federal DNC wiring | Web, mobile, campaign dialer → `evaluateOutboundConsent` |
| Federal DNC fail-closed | Vendor configured + lookup error → block dial |
| CI / contracts | `verify-full` on `main`, 70+ contract tests, CodeQL |
| Product truth | Trust Center, Compare beta copy, voice $/min clarity |
| Launch readiness API | `GET /api/health/launch-readiness` for ops scorecard inputs |

### Gaps closed in governance remediation

| ID | Finding | Fix |
|----|---------|-----|
| H1 | Stale `AUTHZ_MATRIX.md` | Regenerate; `authz:check` fails on drift |
| H2 | Founder cockpit surface drift | Removed UI + `/api/founder/*`; legacy `/founder` redirects to `/overview` |
| H5 | Outbound contract missing federal DNC | Extended compliance contract |
| M1 | Dead `OwnerOnlyRoute.tsx` | Deleted |
| M2–M4 | Docs drift | `ARCHITECTURE.md`, `AGENTS.md`, this plan |
| M7 | `.qa-temp/` noise | `.gitignore` |

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
- [x] Federal DNC hook, AuthZ governance
- [x] Founder cockpit removed (will revisit as a dedicated ops surface later)
- [ ] Activation E2E on production

### Horizon 1 — Use-case excellence (weeks 4–10)

Federal DNC vendor live, outbound analytics UI, learning loop GA, and broad GTM across personal call delegation, sales, support, scheduling, call-center coverage, and optional vertical proof pages.

### Horizon 2 — Distribution (weeks 10–18)

Extension stores, iOS/Android store parity, ChatGPT App GA.

### Horizon 3 — Leadership (weeks 18+)

SSO, live supervisor audio, SDK, marketplace, ERP connectors.

---

## Agent directives

1. Do not reintroduce founder cockpit routes, auth flags, or nav without an explicit product spec.
2. After new routes: `npm run authz:check` and commit matrix.
3. New dial surfaces: `isFederalDncListed` + `evaluateOutboundConsent`.
4. Ops metrics belong in health/observability APIs — not tenant Admin.

---

## Verification gates

`npm run authz:check` · `npm run verify:contracts` · `npm run verify:full`
