---
name: wireline-dogfood
description: >-
  Commission-paid bug hunter — browser-only stress test of Director Chat, Design
  beta (Painter + export integrations), and every authenticated route/tab.
  Clicks every control, waits for streams, hunts console/network 500s, broken
  OAuth, stuck spinners, and silent failures. Live browser MCP only. Use for
  /wireline-dogfood, stress test prod, find bugs, QA dogfood, or app-wide error
  hunting on trywireline.com.
---

# Wireline dogfood — commission bug hunter

**You are paid per real bug found.** Not a tour. Not vibes. **Break it.**

Stress-test **Director Chat**, **Design beta** (`/design` — Painter + Export
integrations), and **every authenticated surface** on production. Your job is to
surface **reproducible defects**: crashes, 500s, OAuth failures, stuck streams,
wrong routing, dead buttons, data leaks, and trust-breaking UX — with evidence.

**Target:** `https://trywireline.com` (unless user says staging/local).

**Out of scope by default:** marketing pages (run only if user asks). For ship
gate + scorecard use [wireline-beast](../wireline-beast/SKILL.md). For cold
discovery UX use [naive-dogfood](../naive-dogfood/SKILL.md).

---

## Mindset

| Commission hunter | Tourist |
|-------------------|---------|
| Every tab clicked; every toggle flipped | Page opened = “pass” |
| Waits for terminal UI state | Leaves during Connecting / Thinking |
| Approves **and** denies Director cards | Only reads approval copy |
| Notes `console.error` + failed `/api/*` when UI breaks | Ignores network |
| Files P0 with repro steps + screenshot | “Seemed fine” |
| Tries empty submit, double-send, rapid nav | Happy path only |

**Landing ≠ tested.** A route is tested when every **Must** row in
[coverage.md](coverage.md) is attempted and waited out.

---

## Demo login (every run)

| | |
|---|---|
| **URL** | `https://trywireline.com/auth` |
| **Email** | `wireline.demo@trywireline.com` |
| **Password** | `WirelineDemo!2026` |

Form sign-in only. No API tokens, no Playwright, no `dogfood-*.mjs`.

Seeded demo data is expected — flag when it looks like real PII without labels.

---

## Hard rules

| Do | Don't |
|----|-------|
| `cursor-ide-browser` MCP only | Playwright, `driver.mjs`, bulk scripts |
| Sidebar clicks for nav | URL bar (except `/auth`, logout, redirect matrix §L) |
| **Wait** for streams — see wait table below | Snapshot and mark done |
| Screenshot every **BLOCK** / P0 / stuck spinner | Chat-only findings |
| Write **all bugs** to `report.md` | Dump only to chat |
| Use [bug-rubric.md](bug-rubric.md) for severity | Inflate nits to P0 |
| Fix P0 inline when safe + `npm run verify` | Weaken tests |

**Artifacts:**

- `terminals/dogfood-prod/journal.md` — timestamped pass/fail ticks
- `terminals/dogfood-prod/report.md` — **primary deliverable** ([template](report-template.md))
- `terminals/dogfood-prod/screenshots/` — `{area}_{issue}.png`

### Wait table

| Target | Max wait | If exceeded |
|--------|----------|-------------|
| Director / Painter stream | 4 min | Screenshot + **BLOCK** |
| Painter live render | 3 min | Screenshot + file bug |
| OAuth popup / redirect | 30 s | Screenshot + file bug |
| Route/tab change | 5 s | Screenshot if stale |
| Chart/table load | 8 s | Bug if perpetual skeleton |

---

## Operating modes

| Mode | Invoke | Focus | Time |
|------|--------|-------|------|
| **Full hunt** | `/wireline-dogfood` | All of coverage.md | 2–4 hr |
| **Director** | `/wireline-dogfood director` | Section C only — deepest | 60–90 min |
| **Design** | `/wireline-dogfood design` | Section D + export lanes | 45–60 min |
| **Regression** | `/wireline-dogfood regression` | Sections A, C, D, L, M | 30–45 min |
| **Surface** | `/wireline-dogfood ops` (etc.) | One coverage section | varies |

**Regression** = re-run after touching Director, Design, OAuth, or shell.

---

## Session flow

Copy checklist into `journal.md`:

```
Wireline dogfood (commission hunt):
- [ ] 0 — Login + session reset (clear Chat + Design threads)
- [ ] 1 — Shell sweep (sidebar, tabs, 390px)
- [ ] 2 — Director Chat ★ (toolbar, probes, approvals, routing)
- [ ] 3 — Design beta ★ (Painter, Export, Figma/Canva/GitHub)
- [ ] 4 — Ops, Training, Insights, Agents
- [ ] 5 — Phone, Email, SMS, Pipeline, Contact
- [ ] 6 — Admin, Integrations, DNC, Audit, Help
- [ ] 7 — Edge stress (double-send, empty forms, rapid nav)
- [ ] 8 — Mobile 390px spot-check
- [ ] 9 — Report + bug tally
```

### 0 — Prep (~5 min)

1. `browser_navigate` → `/auth` → sign in.
2. **Chat** → Clear thread (confirm if prompted).
3. **Design** → Clear thread.
4. Open journal; note date, URL, viewport plan.

### 1 — Shell (Section B)

Follow [coverage.md](coverage.md) §B. Every sidebar item. Every tab per route.
Flag: wrong title, 404, horizontal scroll at 390px, dead nav.

### 2 — Director Chat ★ (Section C) — **never skip**

Highest bug density. Complete **all** of coverage §C:

1. **Toolbar** — model, connectors, capabilities, coach, design mode, brand,
   deep, attach — each opened once.
2. **Starters** — every featured starter → send → **wait for stream end**.
3. **Probes** — strategy, create, execute, research, integrations, coach,
   creative — matrix in coverage §C3–C9.
4. **Approvals** — at least one **Approve** and one **Deny** on execute cards.
5. **Routing guards** — code vs Painter hijack, website vs logo (§C10).
6. **Thread UX** — artifacts, sources, clear thread, mobile composer (§C11).

Log: stream timeouts, empty replies, wrong tool routing, approval stuck state.

### 3 — Design beta ★ (Section D)

1. Painter starters + one long render prompt — wait up to 3 min.
2. Chat/Preview tabs on mobile; Export panel on desktop.
3. **Export integrations** (each lane):
   - Connect **Figma** → OAuth → `?connected=figma` → account shown
   - **Canva** / **GitHub** — connected state or reconnect
   - **Export to Figma** ZIP — toast + download
   - **Export React + Tailwind** ZIP
   - **Send to Canva** — note if disabled (no image artifact = expected)
   - **Create GitHub PR** — only if safe repo selected; cancel if destructive
4. Brand setup panel; Director handoff `?prompt=…` if tested from Chat.

File bugs: invalid OAuth scopes, popup blocked, export 500, silent ZIP fail.

### 4–6 — Fleet workspaces

Sections E–J in coverage. **Every tab.** Interact with primary control;
**cancel** destructive actions (delete, send live SMS, real dial).

### 7 — Edge stress (Section L + M)

- Double-send same Director message
- Empty required form submit
- Rapid route switch ×3
- Watch for `/api/*` 500 when UI errors
- `browser_cdp` → `Runtime.evaluate` → `fetch('/api/design/integrations', {credentials:'include'})` only to **verify** integration state after OAuth — not a substitute for UI clicks

### 8 — Mobile 390px

Minimum: auth, hamburger nav, one Director stream, one approval tap target,
Design Export panel scroll.

### 9 — Report

Fill [report-template.md](report-template.md). Sort bugs P0 → P2. Include coverage
gaps (unattempted Must rows = gap, not pass).

---

## What counts as a bug

Use [bug-rubric.md](bug-rubric.md). Quick filter:

- **P0** — Cannot complete core flow; 500; OAuth broken; data leak; approval
  executes without consent
- **P1** — Feature broken with workaround; stream never completes; wrong routing
  on common prompt
- **P2** — Polish, copy, minor layout, empty state unclear

**Not a bug:** demo seed data when labeled; Send to Canva disabled without PNG
artifact; Painter fallback HTML when live pipeline fails (file as **quality**
not P0 unless export also broken).

---

## Related skills

| Skill | When |
|-------|------|
| [wireline-beast](../wireline-beast/SKILL.md) | Ship gate, scorecard ≥85, moat journeys |
| [naive-dogfood](../naive-dogfood/SKILL.md) | Fresh eyes, amnesia, stranger discovery |
| [wireline-design](../wireline-design/SKILL.md) | Fix cream/velvet UI after bugs filed |

---

## Quick invoke

```
/wireline-dogfood              # Full commission hunt
/wireline-dogfood director     # Director Chat deep stress
/wireline-dogfood design       # Painter + Export integrations
/wireline-dogfood regression   # Hotfix smoke after deploy
```
