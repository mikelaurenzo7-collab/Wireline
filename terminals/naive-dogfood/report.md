# Naive dogfood report

## Run metadata

| Field | Value |
|-------|-------|
| Date | 2026-06-08 |
| Base URL | https://trywireline.com |
| Method | Live browser MCP (`cursor-ide-browser`), amnesia session |
| Mode | Full (time-boxed; Phases 5–6 partial) |
| Personas played | Founder, Floor supervisor, Compliance / risk (+ Pipeline rev ops) |
| Viewports | ~760×626 desktop only (no 390px resize tool in MCP) |
| Amnesia breaks | Phase 7 reconciliation read `wireline-beast/coverage.md` only |

**Session note:** User pre-authenticated on `/ops`. Screenshot tool unavailable in MCP (`browser_screenshot` not exposed). Some routes recovered via `browser_navigate` after stale UI / overlay traps.

---

## Product readback

Wireline is an **operator console for a fleet of AI agents** that answer phones, send texts and email, and chase leads. You land on a **live operations floor** (even when nothing is live), approve AI-drafted follow-ups, listen to past calls, drag deals on a pipeline board, and tune agent voices/scripts in Training. A **Director chat** at the center is meant to be the "hire a wingman" layer — strategy, audits, outbound drafts — but it errored on first use in this session. Compliance tools (DNC, audit log) exist but hide behind the command palette, not the sidebar.

---

## First five minutes

**Worked:** Live Ops copy ("listen in, coach, or escalate") telegraphs the category quickly. Opening the hamburger reveals a sensible IA: Workspace / Channels / Sales / Admin. Command bar (once discovered) is an excellent map.

**Baffled:** Zero live callers + 19 available agents + 2 stale SMS drafts with "Invalid Date" feels like a broken demo, not an empty state. Command bar placeholder suggests actions, but it only accepts route keywords. Director banner about unloaded data on first Chat visit undermines "start here."

**Abandon risk:** A founder who asks a plain question in the command bar or Chat and gets no answer in 60s may assume the product is a static dashboard.

---

## Route map (discovered)

| Nav label | Purpose (my words) | Quality | Notes |
|-----------|-------------------|---------|-------|
| Live Ops | Supervisor cockpit | rough | Actions queue confusing; tab/URL mismatch |
| Chat | Director AI assistant | broken/partial | Data load error; thread lost on refresh |
| Training | Agent tuning & test calls | great | Simulator + 19 agents clear |
| Insights | Performance analytics | ok | Many sub-tabs; brief visit |
| Pipeline | Lead kanban | great | Best day-one clarity |
| Phone | Call history & QA | ok | Timestamp formatting glitch |
| DNC | TCPA block list | ok | Hidden — command bar only |
| Audit | Activity log | great | Searchable, severity filters |
| Design, Email, SMS, Agents, Settings, Help, Founder, Integrations | (not deeply visited) | — | Seen in nav / command bar |

---

## Persona outcomes

| Persona | Goal | Result | Blockers |
|---------|------|--------|----------|
| Founder | Explain value; ask business question | **partial** | Director load error; command bar not conversational |
| Floor supervisor | See live activity; handle urgent queue | **partial** | No live callers; pending SMS show Twilio disabled + Invalid Date |
| Compliance | Find DNC + audit trail | **done** | DNC not in sidebar — required command bar discovery |
| Rev ops | See funnel; nudge leads | **done** | Pipeline kanban immediately usable |

---

## Findings

### BLOCK

| ID | What I was trying | Repro (clicks) | Expected (naive) | Actual | Screenshot |
|----|-------------------|----------------|------------------|--------|------------|
| B1 | Get a plain-English product explanation from Director | Chat → type question → Send | Streaming answer explaining Wireline | "Some Director data could not be loaded…" + stuck on Connecting/Loading fleet context; thread cleared on later refresh | MCP screenshot unavailable |

### CONFUSE

| ID | Screen | What confused me | Suggestion |
|----|--------|------------------|------------|
| C1 | Live Ops → Actions | Pending items show **Invalid Date** and raw Twilio disabled message in the title | Human date; surface integration status once in a banner, not per row |
| C2 | Command bar | Placeholder implies NL actions; typing a question returns "No matching commands" | Label as "Go to…" or add NL routing to Director |
| C3 | Sidebar vs command bar | DNC, Audit, Triage not in sidebar — legal/ops users won't find them | Add Admin entries or Settings cross-links |
| C4 | Live Ops tabs | "Actions" tab maps to URL `?tab=intel` | Align tab label, URL param, and selected state |
| C5 | Chat | Persistent warning about incomplete Director data on empty state | Fix load path or hide thread until hydrated |

### ROUGH

| ID | Screen | Issue |
|----|--------|-------|
| R1 | Global nav | URL changes before main content swaps; prior page visible 1–3s |
| R2 | Command bar | Modal overlay blocks rest of UI; no obvious dismiss besides re-toggle |
| R3 | Phone → Call History | Timestamps run together: `5/20/202610:51 PM` |
| R4 | Live Ops landing | 0 live / 19 available / 2 pending drafts — no guided "start here" for empty floor |

### NICE

| ID | Screen | What delighted |
|----|--------|----------------|
| N1 | Pipeline | Kanban columns + card copy = instant funnel mental model |
| N2 | Training → Simulator | "Test calls before customers dial in" + Start voice test — builder confidence |
| N3 | Command bar palette | Rich descriptions per destination (keyboard hints too) |
| N4 | Audit Log | Serious compliance surface — filterable, searchable, voluminous events |

---

## Console / visible errors

- Benign: none observed in UI chrome
- User-visible / investigate: Director "Some Director data could not be loaded"; Twilio messaging disabled on SMS drafts; Invalid Date on action queue

---

## Top 5 fixes for a day-one user

1. **Make Director's first reply reliable** — founder path dies on load errors.
2. **Fix or filter Live Ops action queue** — Invalid Date + disabled Twilio in every row erodes trust.
3. **Surface DNC / Audit in sidebar or Settings** — compliance users shouldn't need the command palette.
4. **Fix route transition stale content** — URL and visible page must change together.
5. **Clarify command bar vs Chat** — either route questions to Director or rename placeholder to "Go to page…"

---

## Would I come back tomorrow?

Maybe. The **pipeline and training surfaces** feel like a real product with opinionated workflows. The **supervisor story** is credible when I squint at Phone history and Live Ops copy. But day one I hit **empty live floor + scary queue rows + a chat assistant that wouldn't load** — that's the difference between "interesting demo" and "I'd run my business on this." One good Director answer and a clean ops landing would flip the impression.

---

## Reconciliation (post-session)

Surfaces from beast coverage **not** visited during naive pass:

- [ ] Design / Painter (`/design`) — §D
- [ ] Live Ops: Triage tab, Analytics tab — §E
- [ ] Training: Voices, Pronunciation, Flow tabs — §F
- [ ] Insights: Quality, Revenue, Goals, Heatmap, Leaderboard — §G
- [ ] Agents (`/agents`) — §H
- [ ] Email, SMS, Outbound, Appointments channel depth — §I
- [ ] Settings admin tabs (Billing, Team, Branding, Carrier, Growth, Integrations, Activity) — §J
- [ ] Help, Founder dashboards — §K
- [ ] Triage route (`/triage`) — command bar only
- [ ] Mobile 390px hamburger pass — §B
- [ ] Approve/deny action cards in Live Ops — §C5 partial
- [ ] Director streaming probes (fleet audit, etc.) — §C2–C3
- [ ] Keyboard shortcuts `g r`, `g d` — §B
- [ ] Sign out → Back leakage test — §A optional

---

## Sign-off

- [x] Journal complete with per-stop entries
- [ ] Every BLOCK/CONFUSE has screenshot (MCP gap)
- [x] Amnesia held until Phase 7
- [x] Saved under `terminals/naive-dogfood/`
