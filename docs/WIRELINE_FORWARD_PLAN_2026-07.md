# Wireline Forward Plan — July 2026

**Status:** Active · **Last audit:** 2026-07-07 · **Branch baseline:** `main` after cockpit lockdown + governance remediation

## North star

Wireline wins as the **voice AI business operating system** for owner-operated service businesses. Current phase: **Horizon 0 — sell today** (prove activation and first paid conversion before distribution scale).

---

## Audit synthesis (health guardian + scorecard)

### What is solid (keep)

| Area | Verdict |
|------|---------|
| Founder cockpit allowlist | Real defense in depth — UI, API, auth payloads, no `is_admin` bypass |
| Federal DNC wiring | Web, mobile, campaign dialer → `evaluateOutboundConsent` |
| Federal DNC fail-closed | Vendor configured + lookup error → block dial |
| CI / contracts | `verify-full` on `main`, 70+ contract tests, CodeQL |
| Product truth | Trust Center, Compare beta copy, voice $/min clarity |

### Gaps closed in governance remediation

| ID | Finding | Fix |
|----|---------|-----|
| H1 | Stale `AUTHZ_MATRIX.md` | Regenerate; `authz:check` fails on drift |
| H2 | Scanner hid `requireFounderCockpit` | RBAC column + middleware in scanner |
| H3 | Thin cockpit security tests | Security contract + stronger middleware assertions |
| H4 | OAuth fallback missing `founder_cockpit` | `OAuthComplete.tsx` |
| H5 | Outbound contract missing federal DNC | Extended compliance contract |
| M1 | Dead `OwnerOnlyRoute.tsx` | Deleted |
| M2–M4 | Docs drift | `ARCHITECTURE.md`, `AGENTS.md`, this plan |
| M7 | `.qa-temp/` noise | `.gitignore` |

### Still open (operational)

| Item | Owner | Gate |
|------|-------|------|
| Activation E2E proof | Founder | Signup → PSTN call → top-up; validate `/founder` metrics |
| Federal DNC vendor credentials | Ops | `FEDERAL_DNC_API_URL` + `FEDERAL_DNC_API_KEY` in Vercel |
| Upstash Redis in production | Ops | Per `startup.ts` prod warning |

---

## Horizon roadmap

### Horizon 0 — code complete, ops proof pending

- [x] Founder cockpit `/founder` (allowlist-only)
- [x] Trust Center, pricing clarity, outbound hub, product truth
- [x] Federal DNC hook, AuthZ governance
- [ ] Activation E2E on production

### Horizon 1 — Wedge excellence (weeks 4–10)

Federal DNC vendor live, outbound analytics UI, learning loop GA, home-services GTM.

### Horizon 2 — Distribution (weeks 10–18)

Extension stores, iOS/Android store parity, ChatGPT App GA.

### Horizon 3 — Leadership (weeks 18+)

SSO, live supervisor audio, SDK, marketplace, ERP connectors.

---

## Agent directives

1. Never gate cockpit on `is_owner` / `is_admin` — use `founder_cockpit` only.
2. Founder APIs only in `founder-cockpit-routes.ts` + `requireFounderCockpit`.
3. After new routes: `npm run authz:check` and commit matrix.
4. New dial surfaces: `isFederalDncListed` + `evaluateOutboundConsent`.
5. Never embed cockpit in tenant Admin.

---

## Verification gates

`npm run authz:check` · `npm run verify:contracts` · `npm run verify:full`
