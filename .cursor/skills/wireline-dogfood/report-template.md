# Wireline dogfood — commission bug report

## Run metadata

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Base URL | https://trywireline.com |
| Mode | full / director / design / regression / surface |
| Method | Cursor browser MCP only |
| Account | wireline.demo@trywireline.com |
| Viewports | 1440 / 390 / 834 |
| Session reset | Chat clear ✓ / Design clear ✓ |

## Executive summary

| Metric | Count |
|--------|-------|
| P0 | |
| P1 | |
| P2 | |
| Coverage gaps (unattempted Must) | |
| Areas stress-tested | / 11 sections |

**Verdict:** SHIP / HOLD / BLOCK — one sentence why.

---

## Bug ledger (commission findings)

### P0 — fix before ship

| ID | Area | Repro steps | Expected | Actual | Screenshot |
|----|------|-------------|----------|--------|------------|
| P0-1 | | 1. … 2. … | | | |

### P1 — major

| ID | Area | Repro steps | Expected | Actual | Screenshot |
|----|------|-------------|----------|--------|------------|
| P1-1 | | | | | |

### P2 — polish

| ID | Area | Note | Screenshot |
|----|------|------|------------|
| P2-1 | | | |

---

## Director Chat (`/chat`) — stress results

| Category | Attempted | Pass | Fail | Notes |
|----------|-----------|------|------|-------|
| Toolbar (11 controls) | /11 | | | |
| Featured starters | /N | | | |
| Strategy probes | | | | |
| Create probes | | | | |
| Execute + approve | | | | |
| Execute + deny | | | | |
| Research | | | | |
| Integration prompts | | | | |
| Coach mode | | | | |
| Routing guards | | | | |
| Thread UX | | | | |

**Stream failures:** (timeouts, empty replies, wrong tool)

---

## Design beta (`/design`) — stress results

| Check | Pass | Fail | Notes |
|-------|------|------|-------|
| Painter starters + render | | | |
| Live preview / fallback HTML | | | |
| Mobile Chat/Preview tabs | | | |
| Export panel opens | | | |
| Connect Figma + OAuth | | | |
| Connect Canva | | | |
| Connect GitHub | | | |
| Export to Figma ZIP | | | |
| Export React ZIP | | | |
| Send to Canva | | | |
| Create GitHub PR | | | |
| Brand setup | | | |

**Integration API snapshot** (optional verify after UI):

```json
{ "integrations": [] }
```

---

## App-wide route sweep

| Section | Tabs/views | Pass | Fail | Bugs filed |
|---------|------------|------|------|------------|
| Live Ops | 4 | | | |
| Training | 5 | | | |
| Insights | 9 | | | |
| Agents | 2 | | | |
| Phone | 3+ | | | |
| Email / SMS / Pipeline | | | | |
| Admin | 6+ | | | |
| Integrations / DNC / Audit / Help | | | | |

---

## Edge stress

| Test | Result | Bug ID |
|------|--------|--------|
| Director double-send | | |
| Empty form submit | | |
| Rapid route switch ×3 | | |
| Sign out → protected URL | | |

---

## Console / network

- Benign (ignore):
- **Investigate** (tie to bug ID):

---

## Coverage gaps

Must rows from [coverage.md](coverage.md) not attempted this run:

- 

---

## Quality / moat (non-blocking)

| Area | Observation |
|------|-------------|
| Painter render quality | |
| Demo data labeling | |
| Cream/velvet design | |

---

## Sign-off

- [ ] Director §C complete or gaps listed
- [ ] Design §D + export lanes tested or gaps listed
- [ ] P0/P1 bugs have repro + screenshots
- [ ] Saved to `terminals/dogfood-prod/report.md`
