# Wireline Beast — production QA report

## Run metadata

| Field | Value |
|-------|-------|
| Date | 2026-06-08 |
| Skill | wireline-beast |
| Mode | full |
| Gate | launch |
| Base URL | https://trywireline.com |
| Personas exercised | founder, ops |
| Method | Cursor browser only |
| Account | wireline.demo@trywireline.com |
| Viewports | 1440 / 390 |
| Session reset | Chat ✗ (clear disabled during hung stream) / Design ✗ (render aborted on nav) |

---

## Verdict

| Metric | Value |
|--------|-------|
| **Scorecard total** | **49/100** |
| **Verdict** | **NOT READY** |
| Open P0 | 3 |
| MOAT regressions | 2 |

See `terminals/dogfood-prod/scorecard.json` for dimension breakdown.

**Bottom line:** The operator shell, fleet data (19 agents), and Live Ops surfaces are solid. The AI spine is broken in production — Director never completes a stream and both Chat and Design show a persistent hydration failure banner tied to a **500 on `/api/design/profile`**. Painter render timed out without producing a preview. Ship is blocked until Director/Painter can complete at least one end-to-end thread on the demo tenant.

---

## Operator journeys

| ID | Name | Priority | Result | Notes |
|----|------|----------|--------|-------|
| J1 | Morning command | P0 | **fail** | Ops floor OK (19 agents); Director prompt hung >3m on "Connecting to Director" |
| J2 | Floor hour | P0 | **pass** | All Ops tabs load; Actions "All clear"; Triage grid readable; mobile 390 Triage OK |
| J3 | Fleet audit & coach | P0 | **fail** | Blocked by Director hang; Casey present in Training fleet |
| J4 | Triage → contact | P1 | skip | Empty triage queue; Phone call history empty |
| J5 | Pipeline → execute | P1 | **fail** | Director execute untestable; Pipeline empty (no Jordan Lee) |
| J6 | Integration story | P1 | partial | Not fully exercised; marketplace not re-opened this session |
| J7 | Compliance pass | P1 | partial | DNC/compliance sections visible in Triage; audit tab not fully swept |
| J8 | Painter ship check | P0 | **fail** | Render started → toast "Design didn't finish in time"; no preview iframe |
| J9 | First 15 minutes | Launch | **pass** | Sidebar discoverability good; Chat/Agents/Phone reachable in ≤2 clicks |

---

## Scorecard dimensions

| Dimension | Weight | Score 1–5 | Weighted | Notes |
|-----------|--------|-----------|----------|-------|
| Functional completeness | 20% | 2 | 0.40 | Multiple P0 journeys fail |
| Director & AI spine | 20% | 1 | 0.20 | Hang + hydration banner |
| Painter & design studio | 10% | 2 | 0.20 | Timeout, no preview |
| Shell & layout | 15% | 5 | 0.75 | Rail + mobile clean |
| Trust & compliance UX | 15% | 2 | 0.30 | Execute path unreachable |
| Design & craft | 10% | 4 | 0.40 | On-brand cream/velvet |
| Observability & stability | 10% | 2 | 0.20 | `/api/design/profile` 500 |
| **Total** | | | **49/100** | |

---

## Fixes applied this session

| ID | Sev | File(s) | Change | Re-verified live |
|----|-----|---------|--------|------------------|
| — | — | — | Audit-only run; no code changes | — |

---

## Director Chat (`/chat`)

| Category | Result | Notes |
|----------|--------|-------|
| Toolbar (all chips) | partial | Visible on empty hero; not all clicked due to hung stream |
| Stream phases (preparing→reply) | **fail** | Stuck "Connecting to Director" 3m 9s+; never reached reply |
| Strategy / Create / Execute | **fail** | J1 weekly-focus prompt sent; no substantive reply |
| Approve + Deny | **fail** | Not reachable |
| Coach + fleet-only return | **fail** | Not reachable |
| Moat probes M1–M7 | skip | Blocked |
| Thread hydration banner | **fail** | DF-003: banner on fresh empty hero after sign-in + refresh |

---

## Painter (`/design`)

| Check | Result | Notes |
|-------|--------|-------|
| Studio chrome | pass | Beta badge, split layout, starters |
| Render probe ≤3min | **fail** | Debt-relief prompt → timeout toast; thread lost on navigation |
| Mobile Preview tab | skip | Render never completed |
| Brand setup | skip | Profile API 500 |

---

## Coverage sweep (routes not in journeys)

| Area | Tabs/views | Result | Design notes |
|------|------------|--------|--------------|
| Training | Knowledge + agents | pass | 19 agents incl. Casey; knowledge UI loads |
| Insights | Performance funnel | pass | Empty funnel designed state |
| Agents | templates, fleet | pass | Template gallery; My Fleet shows Casey |
| Phone | history | pass | Empty state; tabs present |
| Email / SMS / Pipeline | | partial | Email/SMS empty states OK; Pipeline empty (no seeded leads) |
| Admin | Settings landing | partial | `/admin` loads; full 8-tab sweep not completed |
| Integrations / Help | | skip | Prior run artifacts exist; not re-verified live |
| Status / Changelog / Security | | skip | Out of time after P0 blockers |
| Founder | | skip | Not attempted |

---

## Bugs & backlog

### P0

| ID | Area | Repro | Expected | Actual | Screenshot | File hint |
|----|------|-------|----------|--------|------------|-----------|
| BEAST-001 | Director | `/chat` → send any strategy prompt | Stream completes ≤3m with reply | Stuck "Connecting to Director" >3m; composer disabled | `screenshots/desktop_chat_df002_connecting_hang.png` | `useStreamingChat.ts`, `director-routes.ts`, `DirectorWorkspace.tsx` |
| BEAST-002 | Director | Fresh sign-in → `/chat` empty hero | No hydration banner | "Some Director data could not be loaded…" persistent | `screenshots/desktop_chat_df003_hydration_banner.png` | `director-store.ts`, `DirectorWorkspace.tsx`, `design-profile-routes.ts` |
| BEAST-003 | API | Authenticated GET `/api/design/profile` | 200 + profile JSON | **500** observed in browser perf log | — | `src/routes/design-profile-routes.ts`, `src/lib/design-profile.ts` |

### P1 / P2 / MOAT

| ID | Sev | Area | Note | File hint |
|----|-----|------|------|-----------|
| BEAST-004 | MOAT | Painter | Render probe timed out; no HTML preview | `director-design-orchestrator.ts`, design routes |
| BEAST-005 | P1 | Pipeline | Demo tenant has no seeded leads / Jordan Lee for execute probe | seed scripts / demo data |
| BEAST-006 | P1 | J2 | Keyboard `g` `t` triage shortcut not verified | `AppShell` shortcuts |

### UX improvements

| Screen | Issue | Recommendation | Screen code |
|--------|-------|----------------|-------------|
| Chat | Hung stream blocks Clear thread | Allow cancel / clear even mid-connect | CHAT-OPS |

---

## Regression watch

| ID | Pass | Notes |
|----|------|-------|
| DF-001 sidebar rail | **pass** | `--wireline-rail-w` 216px; Email h1 left 246px at 1440 |
| DF-002 Director stream | **fail** | >3m connecting hang |
| DF-003 thread hydration | **fail** | Banner on Chat + Design empty state |

---

## Console / network

**Benign:** Plausible analytics 202s

**Investigate:**
- `GET https://trywireline.com/api/design/profile` → **500** (likely root cause for DF-003 and may affect Director prepare phase)
- Director SSE never reached terminal UI state during J1 probe
- Painter timeout toast: "Design didn't finish in time — Spectrum Desk may still be running"

---

## Sign-off

- [x] vision.md READY criteria evaluated
- [x] P0 journeys attempted
- [x] scorecard.json written
- [x] Screenshots for failures
- [ ] `npm run verify` if code changed (N/A — audit only)
- [x] User informed of verdict + gaps to READY

### Path to READY (minimum)

1. Fix `/api/design/profile` 500 for demo tenant (check migration `0047_director_message_thread_key.sql` + `design_profile` table RLS)
2. Re-run DF-002 + DF-003 — Director must stream a substantive reply; empty hero must have no banner
3. Re-run J8 Painter render probe to completion (preview iframe)
4. Re-run J5 approve + deny on Jordan Lee execute card (seed pipeline if needed)
5. Regression mode pass → full beast score ≥85
