---
name: naive-dogfood
description: >-
  Fresh-eyes browser dogfood with full feature stress testing. Day-one operator on
  the demo tenant (wireline.demo@trywireline.com): discover UI like a stranger,
  then click every toggle, chip, tab, starter, approval, and probe — wait for
  streams to finish. Live browser MCP only, no scripts. Journal during session;
  all findings in final report. Use for /naive-dogfood, naive dogfood, first-time
  user stress test, fresh eyes QA, or blind UX audit with real interaction depth.
---

# Naive dogfood — stranger who actually uses the product

**Browse like you’ve never seen it. Test like you’re paid to break it.**

You are a **day-one operator** on the **demo workspace** — new to Wireline, not
new to having sample agents and leads. Discover nav cold, then **stress every
feature**: toggles, cheat chips, starters, approvals, tabs, streams. ~**60–90 min**
full run.

**Not** a sightseeing tour. **Landing ≠ tested.**

---

## Demo login (use every run)

| | |
|---|---|
| **URL** | `https://trywireline.com/signin` (or `/auth`) |
| **Email** | `wireline.demo@trywireline.com` |
| **Password** | `WirelineDemo!2026` |

Fill the form and submit. No API login, no Playwright, no scripts.

Full demo framing: [demo-tenant.md](demo-tenant.md)

---

## Hard rules

| Do | Don't |
|----|-------|
| Browser MCP only (`browser_navigate`, `snapshot`, `click`, `fill`, `type`, `press`, `scroll`, `wait`, `screenshot`) | Playwright, `driver.mjs`, `dogfood-*.mjs`, bulk `browser_evaluate` |
| Sidebar clicks for nav | URL bar (except `/auth`, logout check, redirects in matrix §L) |
| **Wait** for streams, spinners, charts — see [stress-matrix.md](stress-matrix.md) | Snapshot a page and mark it “done” |
| Click **every** toolbar chip, tab, toggle on each route | Skip “cheat” modes (Coach, Design, Deep, Capabilities) |
| Send probes → wait for terminal UI state | Leave during Connecting / Thinking |
| Approve **and** deny at least one Director card each | Only browse approval UI |
| Short journal notes during session | Skip the final report |
| **All findings in `report.md`** at end | Dump only to chat |
| Read [stress-matrix.md](stress-matrix.md) + [demo-tenant.md](demo-tenant.md) | Read beast/dogfood coverage / ARCHITECTURE mid-session |

**Artifacts:**

- `terminals/naive-dogfood/journal.md` — timestamps + pass/fail ticks (lightweight)
- `terminals/naive-dogfood/report.md` — **primary deliverable**
- `terminals/naive-dogfood/screenshots/` — every BLOCK, failed probe, stuck spinner

---

## The two modes in one session

### 1. Stranger brain (discovery)

- Don’t read product docs or prior QA reports.
- Infer purpose from labels, empty states, copy.
- Journal: *“I thought this screen was for…”*
- Flag when **seeded demo data** is unclear — see [demo-tenant.md](demo-tenant.md).

### 2. Stranger hands (stress)

- Follow [stress-matrix.md](stress-matrix.md) **Must** rows on every surface.
- Type prompts in natural language (matrix gives examples).
- **Wait it out** — 4 min max on Director streams, 3 min on Painter render.
- Screenshot failures; note console errors only when UI breaks.

---

## Session flow (~60–90 min)

Copy into `journal.md`:

```
Naive dogfood:
- [ ] 0 — Prep & login
- [ ] 1 — First impressions (5 min)
- [ ] 2 — Shell sweep + tabs
- [ ] 3 — Director (toolbar + probes + approvals)
- [ ] 4 — Painter / Design
- [ ] 5 — Ops, Training, Insights, Agents
- [ ] 6 — Phone, Email, SMS, Pipeline, Contact
- [ ] 7 — Admin, Integrations, DNC, Audit, Help
- [ ] 8 — Edge stress + mobile 390px
- [ ] 9 — Final report
```

### 0 — Prep & login (~5 min)

1. Read [demo-tenant.md](demo-tenant.md) — understand demo vs blank signup.
2. `browser_navigate` → `/auth` → sign in with credentials above.
3. **Clear Chat thread** and **Clear Design thread** once (session start only).
4. Note in journal: *“Day-one operator on demo tenant.”*

### 1 — First impressions (~5 min)

On the post-auth landing route **before** sidebar touring:

- 10-word first impression
- Click the most prominent CTA
- Send **one** message in your own words; **wait** for full reply
- Write product hypothesis (2–3 sentences)

### 2 — Shell sweep (~10 min)

Sidebar top → bottom. **Per route:**

1. Snapshot → guess purpose (stranger brain)
2. Click **every tab** (stranger hands)
3. One primary interaction (open row, expand card, toggle filter)
4. Tick matrix section A + route-specific **Must** items

### 3 — Director (~25 min) ★ heaviest

Work through stress-matrix **§B** in order:

1. **Every composer chip** — Coach, Design, Deep, Capabilities, Connectors, etc.
2. **Starter prompts** — all featured + one from More
3. Strategy, Create, Research, Integration probes — **wait each stream**
4. Execute prompts → **Approve one, Deny one**
5. Coach probes + routing guards
6. 390px: one approval card tap test

If stream stuck >4 min → screenshot + BLOCK + move on.

### 4 — Painter (~10 min)

Stress-matrix **§C**: starters, render probe (wait 3 min), brand setup, clear thread.

### 5 — Ops · Training · Insights · Agents (~15 min)

Sections **§D–G**. Every tab/sub-view. Wait for charts.

### 6 — Channels (~10 min)

Section **§H**. Expand call row, open email thread, pipeline card, contact timeline.

### 7 — Admin & compliance (~10 min)

Section **§I**. Every admin tab; integrations connect modal; help search.

### 8 — Edge + mobile (~10 min)

Section **§J–K**. Double-click, empty submit, rapid nav, 390px hamburger pass.

### 9 — Final report (~10 min)

1. Build `terminals/naive-dogfood/report.md` from [report-template.md](report-template.md).
2. Include **coverage tally** from stress-matrix footer.
3. **All BLOCK / CONFUSE / ROUGH / NICE** — none only in chat.
4. Product readback + top 5 fixes + “would I come back?”
5. Optional: reconcile missed items vs beast `coverage.md` (post-report only).

---

## Operating modes

| Mode | Time | Scope |
|------|------|-------|
| **`/naive-dogfood`** (default) | 60–90 min | Full flow above |
| `/naive-dogfood quick` | 45 min | §0–2 + Director toolbar + 3 probes + 1 approve/deny + report |
| `/naive-dogfood director` | 30 min | §B only + report |
| `/naive-dogfood mobile` | 30 min | §K + abbreviated §B |

---

## Wait discipline

After every send, save, or tab change:

```
browser_wait → browser_snapshot → confirm terminal state
```

| UI state | Action |
|----------|--------|
| Connecting / Preparing / Thinking | Keep waiting (≤4 min) |
| Streaming text | Wait until stop + actions enabled |
| Spinner on chart | Wait ≤8 s |
| Stale previous route visible | Screenshot + ROUGH |

---

## Finding severity

| Tag | When |
|-----|------|
| **BLOCK** | Can’t finish action; crash; stream never completes; data loss |
| **CONFUSE** | Done but product story unclear; demo data unlabeled |
| **TRUST** | Demo looks like real customer data; scary compliance gap |
| **ROUGH** | Slow, ugly, flaky, tiny target |
| **NICE** | Delight |

---

## Journal vs report

| Journal (during) | Report (end) |
|------------------|--------------|
| Timestamp, route, pass/fail tick | Full repro steps |
| One-line “I thought…” | Grouped findings tables |
| Matrix checkbox progress | Coverage tally % |
| | Screenshots linked |
| | Product readback narrative |

**Minimum journal entry per route:**

```markdown
### [HH:MM] <nav label> / <tab>
Hypothesis: …
Matrix: §D Ops floor — pass | fail
Wait: stream 45s OK
```

---

## Anti-patterns

| Failure | Fix |
|---------|-----|
| “I visited all routes” | Routes without matrix **Must** = incomplete |
| “Seeded data confused me” | Expected — log as CONFUSE/TRUST, **keep testing** |
| “I’ll note bugs in chat” | Put everything in `report.md` |
| Left during Thinking | Re-run that probe or mark BLOCK |
| Skipped Coach/Design/Deep | Invalid run |

---

## Resources

- [demo-tenant.md](demo-tenant.md) — login + seeded account framing
- [stress-matrix.md](stress-matrix.md) — exhaustive **Must** interactions
- [amnesia.md](amnesia.md) — what not to read mid-session
- [personas.md](personas.md) — optional flavor for probe wording
- [report-template.md](report-template.md) — final deliverable
