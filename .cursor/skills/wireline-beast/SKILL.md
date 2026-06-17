---
name: wireline-beast
description: >-
  Wireline production-readiness beast — the master live QA skill. Browser-only
  E2E on authenticated operator product at trywireline.com: operator journeys
  (founder/ops/compliance), Director moat probes, Painter studio, every route/tab,
  trust ladder, weighted scorecard (85+ = READY), cream/velvet design bar.
  Fix P0 inline or log all findings. No scripts. Use for /wireline-beast,
  production ready, ship gate, live QA, UX audit, moat validation.
---

# Wireline Beast — production readiness engine

**Not a click map. A ship gate.**

Validates whether Wireline delivers its **moat**: mission-control Director, live
supervisor cockpit, human-in-the-loop execute, fleet coaching, and editorial
craft — on **authenticated client-facing surfaces only**.

**Read first:** [vision.md](vision.md) — north star, personas, release gates.

**Target:** `https://trywireline.com` (unless user specifies staging/local).

**Out of scope:** marketing (`/pricing`, `/showcase`), public blog, logged-out
pages (unless user asks).

---

## What makes this skill powerful

| Layer | File | Purpose |
|-------|------|---------|
| **Vision** | [vision.md](vision.md) | Product promise, differentiation, READY definition |
| **Journeys** | [operator-journeys.md](operator-journeys.md) | JTBD scenarios — routes serve stories |
| **Coverage** | [coverage.md](coverage.md) | Exhaustive route/tab/probe matrix |
| **Trust & moat** | [trust-moat.md](trust-moat.md) | Approvals, compliance, routing guards |
| **Demo contract** | [demo-contract.md](demo-contract.md) | Seeded tenant expectations |
| **Scorecard** | [scorecard.md](scorecard.md) | Weighted 100-pt verdict (≥85 = READY) |
| **Design bar** | [design-bar.md](design-bar.md) | Aurora Cream + shadcn + CSP |
| **Fix playbook** | [fix-playbook.md](fix-playbook.md) | Symptom → file → re-verify |
| **Regression** | [regression-watch.md](regression-watch.md) | Post-deploy must-pass |

---

## Hard rules

| Do | Don't |
|----|-------|
| `cursor-ide-browser` only | Playwright, `dogfood-*.mjs`, API login, curl |
| Sidebar clicks for nav | URL bar (except redirects) |
| Operator **journeys** + coverage | Checkbox tourism without story |
| Scorecard + journeys in report | "Looks fine" without evidence |
| Screenshot every fail | Skip ambiguous UI — **fail closed** |
| Fix P0 when safe | Silent P0s |
| `npm run verify` after fixes | Weaken tests |

**Demo:** `wireline.demo@trywireline.com` / `WirelineDemo!2026` — see
[demo-contract.md](demo-contract.md).

**Artifacts:**

- `terminals/dogfood-prod/dogfood-report.md`
- `terminals/dogfood-prod/scorecard.json`
- `terminals/dogfood-prod/screenshots/{viewport}_{route}_{issue}.png`

---

## Operating modes

| Mode | Invoke | Gate | Time |
|------|--------|------|------|
| **Full beast** | `/wireline-beast` | Launch | 3–5 hr |
| **Journeys** | `/wireline-beast journeys` | Weekly | 60–90 min |
| **Regression** | `/wireline-beast regression` | Hotfix | 20–30 min |
| **Director** | `/wireline-beast director` | AI spine | 45–90 min |
| **Surface** | `/wireline-beast ops` | Targeted | varies |
| **Fix** | `/wireline-beast fix` | — | fix P0 inline |
| **Audit** | `/wireline-beast audit` | — | report only |

### What each mode runs

**Full beast:** vision intake → all P0+P1 journeys → coverage A–N → moat probes →
scorecard → report.

**Journeys:** J1+J2+J3+J8 (P0) + shell smoke + scorecard lite.

**Regression:** [regression-watch.md](regression-watch.md) + last report P0 areas.

**Director:** coverage §C + [trust-moat.md](trust-moat.md) moat probes M1–M7.

---

## Session workflow (full beast)

```
0. INTAKE    → Read vision.md; pick personas (Founder + Ops minimum); read last report
1. SETUP     → 1440 desktop; sign in /auth; confirm demo-contract baseline
2. RESET     → Clear Chat + Design threads (UI)
3. JOURNEYS  → J1→J2→J3→J8 (P0); then J4–J7, J9 if launch gate
4. COVERAGE  → Remaining routes/tabs not hit by journeys (coverage E–N)
5. MOAT      → trust-moat probes; approve AND deny execute cards
6. DESIGN    → design-bar on every surface touched; P0: Director, shell, Painter
7. MOBILE    → 390px: shell, Chat, Design, Ops (J2 step 5)
8. OBSERVE   → CDP console + /api/* ; rail width check
9. SCORE     → scorecard.md → scorecard.json
10. REPORT   → report-template.md; re-run failed items if fixed
```

### Browser MCP

```
browser_navigate → browser_lock(lock) → interact → browser_lock(unlock)
```

Viewports: **1440** (primary), **390** (mobile), **834** (tablet spot-check).

Streams: poll `browser_snapshot` 30s–3min; phases **preparing → thinking → reply**.

---

## Two AI surfaces

| | **Director** `/chat` | **Painter** `/design` |
|---|---------------------|----------------------|
| Thread | `director` | `painter` |
| Job | Fleet, strategy, execute, coach, code | HTML preview studio |
| Clear | Chat header | Design header |

Never conflate. Both required every full run.

---

## Personas (state in report)

| Persona | Primary journeys |
|---------|------------------|
| **Founder** | J1 Morning command, J3 Fleet audit, J6 Integrations |
| **Ops lead** | J2 Floor hour, J4 Triage → contact |
| **Rev** | J5 Pipeline → execute |
| **Compliance** | J7 Compliance pass |

---

## Severity & fix policy

| Tag | Meaning | Action |
|-----|---------|--------|
| **P0** | Ship blocker | Fix now → [fix-playbook.md](fix-playbook.md) → re-verify |
| **P1** | Should fix before launch | Fix if <15 min else log |
| **P2** | Polish | Log |
| **MOAT** | Generic AI / trust regression | Min P1; blocks READY if core |

---

## Production-ready verdict

**READY** when ALL true:

- [ ] [scorecard.md](scorecard.md) total **≥ 85** and no dimension **< 3**
- [ ] P0 journeys **J1, J2, J3, J8** pass
- [ ] Execute path: **Approve + Deny** tested
- [ ] Zero open **P0** bugs
- [ ] Shell: no sidebar clip at 1440
- [ ] `scorecard.json` + report saved

Anything else → **NOT READY** with explicit gap list.

---

## Known regression (post-deploy)

| ID | Check |
|----|-------|
| DF-001 | Rail width vs main padding — Email title not clipped |
| DF-002 | Director preparing phase; no >4min connecting hang |
| DF-003 | No persistent thread hydration banner |

Details: [regression-watch.md](regression-watch.md).

---

## Quick probes (minimum if time-boxed)

1. J1 Morning command (partial OK if Director completes)
2. J3 Fleet audit + coach return fleet-only
3. J5 Deny + Approve on execute cards
4. J8 Painter render probe
5. Sidebar clip check on Email at 1440

---

## Design & shadcn (on touch)

[design-bar.md](design-bar.md) + `.cursor/skills/wireline-design/`:

- Cream/velvet; `wl-panel`; no new `style={` in TSX
- shadcn from `src/components/ui/shadcn/`
- Director: `WL_DIRECTOR_CLASSES`, `wireline-director-design.ts`
- Empty / loading / error / streaming on every surface judged

---

## CDP snippets

```javascript
// Rail vs content
getComputedStyle(document.documentElement).getPropertyValue('--wireline-rail-w')
getComputedStyle(document.querySelector('main')).paddingLeft

// Stream phase (accessibility tree or text search in snapshot)
document.body.innerText.includes('Loading fleet context')
```

---

## Invoke cheat sheet

```
/wireline-beast              # Launch gate — full engine
/wireline-beast journeys     # Weekly — P0 journeys + scorecard
/wireline-beast regression   # Hotfix smoke
/wireline-beast director     # AI spine + moat
/wireline-beast fix          # Fix P0 as found
/wireline-beast audit        # Report only
```

**Not this skill:** `run-wireline` (local dev), Playwright CI, marketing QA.

**Related:** [wireline-dogfood](../wireline-dogfood/SKILL.md) — commission bug-hunt
stress (Director + Design + app-wide). Beast = ship gate + scorecard; dogfood =
find defects.
