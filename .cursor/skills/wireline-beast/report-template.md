# Wireline Beast — production QA report

## Run metadata

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Skill | wireline-beast |
| Mode | full / journeys / regression / director / audit |
| Gate | hotfix / weekly / launch |
| Base URL | https://trywireline.com |
| Personas exercised | founder, ops, … |
| Method | Cursor browser only |
| Account | wireline.demo@trywireline.com |
| Viewports | 1440 / 390 / 834 |
| Session reset | Chat ✓ / Design ✓ |

---

## Verdict

| Metric | Value |
|--------|-------|
| **Scorecard total** | /100 |
| **Verdict** | READY / NEAR / RISK / NOT READY |
| Open P0 | count |
| MOAT regressions | count |

See `terminals/dogfood-prod/scorecard.json` for dimension breakdown.

---

## Operator journeys

| ID | Name | Priority | Result | Notes |
|----|------|----------|--------|-------|
| J1 | Morning command | P0 | pass/fail/skip | |
| J2 | Floor hour | P0 | | |
| J3 | Fleet audit & coach | P0 | | |
| J4 | Triage → contact | P1 | | |
| J5 | Pipeline → execute | P1 | | |
| J6 | Integration story | P1 | | |
| J7 | Compliance pass | P1 | | |
| J8 | Painter ship check | P0 | | |
| J9 | First 15 minutes | Launch | | |

---

## Scorecard dimensions

| Dimension | Weight | Score 1–5 | Weighted | Notes |
|-----------|--------|-----------|----------|-------|
| Functional completeness | 20% | | | |
| Director & AI spine | 20% | | | |
| Painter & design studio | 10% | | | |
| Shell & layout | 15% | | | |
| Trust & compliance UX | 15% | | | |
| Design & craft | 10% | | | |
| Observability & stability | 10% | | | |
| **Total** | | | **/100** | |

---

## Fixes applied this session

| ID | Sev | File(s) | Change | Re-verified live |
|----|-----|---------|--------|------------------|
| | P0 | | | |

---

## Director Chat (`/chat`)

| Category | Result | Notes |
|----------|--------|-------|
| Toolbar (all chips) | | |
| Stream phases (preparing→reply) | | |
| Strategy / Create / Execute | | |
| Approve + Deny | | |
| Coach + fleet-only return | | |
| Moat probes M1–M7 | | |
| Thread hydration banner | | |

---

## Painter (`/design`)

| Check | Result | Notes |
|-------|--------|-------|
| Studio chrome | | |
| Render probe ≤3min | | |
| Mobile Preview tab | | |
| Brand setup | | |

---

## Coverage sweep (routes not in journeys)

| Area | Tabs/views | Result | Design notes |
|------|------------|--------|--------------|
| Training | 5 tabs | | |
| Insights | 9 views | | |
| Agents | templates, fleet | | |
| Phone | history, outbound, appointments | | |
| Email / SMS / Pipeline | | | |
| Admin | 8 tabs | | |
| Integrations / Help | | | |
| Status / Changelog / Security | | | |
| Founder | | skip if 403 | |

---

## Bugs & backlog

### P0

| ID | Area | Repro | Expected | Actual | Screenshot | File hint |
|----|------|-------|----------|--------|------------|-----------|
| | | | | | | |

### P1 / P2 / MOAT

| ID | Sev | Area | Note | File hint |
|----|-----|------|------|-----------|
| | MOAT | | | |

### UX improvements

| Screen | Issue | Recommendation | Screen code |
|--------|-------|----------------|-------------|
| | | | CHAT-OPS |

---

## Regression watch

| ID | Pass | Notes |
|----|------|-------|
| DF-001 sidebar rail | | |
| DF-002 Director stream | | |
| DF-003 thread hydration | | |

---

## Console / network

**Benign:**

**Investigate:**

---

## Sign-off

- [ ] vision.md READY criteria evaluated
- [ ] P0 journeys attempted
- [ ] scorecard.json written
- [ ] Screenshots for failures
- [ ] `npm run verify` if code changed
- [ ] User informed of verdict + gaps to READY
