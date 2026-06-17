# Naive dogfood report

## Run metadata

| Field | Value |
|-------|-------|
| Date | |
| Base URL | `https://trywireline.com` |
| Account | `wireline.demo@trywireline.com` |
| Method | Live browser MCP — day-one operator on demo tenant |
| Duration | |
| Viewports | 1440 / 834 / 390 |
| Threads cleared at start | Chat ☐  Design ☐ |

---

## Product readback

Explain what this product does to a friend — **only** from this session.

## First five minutes

| | Notes |
|---|-------|
| First impression (10 words) | |
| Landing route purpose (my guess) | |
| First message sent + wait result | |
| Would a day-one user know this is demo data? | yes / no / partial |

---

## Coverage tally

From [stress-matrix.md](stress-matrix.md) footer:

| Area | Attempted | Passed | Failed | Skipped |
|------|-----------|--------|--------|---------|
| Shell (A) | /9 | | | |
| Director toolbar (B1) | /11 | | | |
| Director probes sent | | | | |
| Approvals (approve + deny) | ☐ ☐ | | | |
| Painter (C) | /7 | | | |
| Ops tabs (D) | /4 | | | |
| Training tabs (E) | /5 | | | |
| Insights views (F) | /9 | | | |
| Agents (G) | /2 | | | |
| Channels (H) | /5 areas | | | |
| Admin & compliance (I) | | | | |
| Edge + mobile (J–K) | | | | |

**Overall Must coverage:** __% — list any unattempted **Must** rows below.

### Unattempted (coverage gaps)

-

---

## Route map (discovered)

| Nav label | My purpose guess | Stress-tested? | Quality |
|-----------|------------------|----------------|---------|
| | | yes / partial / tour-only | great / ok / rough / broken |

---

## Director probe log

| Probe / prompt | Wait time | Result | Notes |
|----------------|-----------|--------|-------|
| | | pass / fail / timeout | |

### Toolbar chips

| Chip | Opened | Toggled / used | Issue |
|------|--------|----------------|-------|
| Model | | | |
| Connectors | | | |
| Capabilities | | | |
| Coach | | | |
| Abilities | | | |
| Design mode | | | |
| Brand setup | | | |
| Account branding | | | |
| Deep / Brain | | | |
| Attach | | | |

---

## Demo tenant UX

| Question | Finding |
|----------|---------|
| Obvious this is sample/demo data? | |
| Demo badges where seeded rows show? | |
| Missing promised demo content? | |
| Clear-thread UX discoverable? | |

---

## Findings (all — primary deliverable)

### BLOCK

| ID | Area | Repro (clicks) | Expected | Actual | Screenshot |
|----|------|----------------|----------|--------|------------|

### TRUST

| ID | Area | Issue | Screenshot |
|----|------|-------|------------|

### CONFUSE

| ID | Screen | What confused a day-one user | Suggestion |
|----|--------|------------------------------|------------|

### ROUGH

| ID | Screen | Issue | Screenshot |
|----|--------|-------|------------|

### NICE

| ID | Screen | What worked well |
|----|--------|------------------|

---

## Stream / wait failures

| Probe | Stuck state | Duration | Screenshot |
|-------|-------------|----------|------------|

---

## Console / network (user-visible only)

- Benign:
- Investigate:

---

## Top 10 fixes (ranked)

1.
2.
3.
4.
5.
6.
7.
8.
9.
10.

---

## Would I come back tomorrow?

One honest paragraph.

---

## Reconciliation (optional, post-report)

Missed vs beast coverage:

-

File hints:

| Finding ID | File hint |
|------------|-----------|

---

## Sign-off

- [ ] Every stress-matrix **Must** attempted or listed as gap
- [ ] Director: approve + deny both done
- [ ] All findings in this file (not chat-only)
- [ ] BLOCK/CONFUSE/TRUST have screenshots
- [ ] Saved to `terminals/naive-dogfood/report.md`
