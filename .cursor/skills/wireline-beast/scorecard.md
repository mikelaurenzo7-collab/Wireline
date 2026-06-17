# Production readiness scorecard

Score each dimension **1–5** after the run. Write totals to report + `scorecard.json`.

**Launch bar:** Total ≥ **85/100** AND no dimension **< 3**.

## Dimensions (weights)

### 1. Functional completeness (20%)

Can operators complete core jobs without dead ends?

| Score | Criteria |
|-------|----------|
| 5 | All P0 journeys pass; coverage skips only documented |
| 4 | One P1 journey fail; all P0 pass |
| 3 | Director OR Painter partial; routes mostly OK |
| 2 | Multiple P0 journeys fail |
| 1 | Cannot sign in or use shell |

### 2. Director & AI spine (20%)

Mission control works — Wireline's differentiator.

| Score | Criteria |
|-------|----------|
| 5 | Strategy + create + execute (approve/deny) + coach; moat probes pass |
| 4 | Streams complete; execute or coach partial |
| 3 | Replies arrive but shallow or slow; approvals flaky |
| 2 | Persistent hang / degraded banner |
| 1 | Chat unusable |

### 3. Painter & design studio (10%)

| Score | Criteria |
|-------|----------|
| 5 | Render probe completes; mobile preview; brand setup |
| 4 | Preview partial; stream completes |
| 3 | Stream only; no preview |
| 2 | Studio broken |
| 1 | Route error |

### 4. Shell & layout (15%)

| Score | Criteria |
|-------|----------|
| 5 | 1440 + 390 clean; rail width correct; keyboard shortcuts |
| 4 | Minor clip or transition stale |
| 3 | Sidebar clip on some routes (P0 territory) |
| 2 | Mobile nav broken |
| 1 | App shell unusable |

### 5. Trust & compliance UX (15%)

| Score | Criteria |
|-------|----------|
| 5 | Approvals clear; DNC/audit reachable; live vs proposed obvious |
| 4 | One trust signal weak |
| 3 | Approvals work but audit/DNC sketchy |
| 2 | Auto-execute or ambiguous proposed |
| 1 | Trust model broken |

### 6. Design & craft (10%)

Aurora Cream bar on surfaces touched.

| Score | Criteria |
|-------|----------|
| 5 | P0 surfaces on-brand; states complete; shadcn consistent |
| 4 | Minor P2 craft issues |
| 3 | Off-brand hues or missing empty states |
| 2 | Generic SaaS feel on Director/shell |
| 1 | Unreadable contrast or broken tokens |

### 7. Observability & stability (10%)

| Score | Criteria |
|-------|----------|
| 5 | No core API 5xx; streams terminal; console clean |
| 4 | Benign third-party noise only |
| 3 | Occasional 4xx explained |
| 2 | Repeated API failures |
| 1 | Crash or infinite spinners |

## Calculation

```
total = round( sum(score_i * weight_i) * 20 )   // max 100
```

Example: all 4s → `4 * 1.0 * 20 = 80` → NOT READY (need 85).

## scorecard.json template

```json
{
  "date": "YYYY-MM-DD",
  "url": "https://trywireline.com",
  "gate": "launch",
  "personas": ["founder", "ops"],
  "dimensions": {
    "functional": { "score": 4, "weight": 0.2, "notes": "" },
    "director": { "score": 3, "weight": 0.2, "notes": "" },
    "painter": { "score": 4, "weight": 0.1, "notes": "" },
    "shell": { "score": 5, "weight": 0.15, "notes": "" },
    "trust": { "score": 4, "weight": 0.15, "notes": "" },
    "design": { "score": 4, "weight": 0.1, "notes": "" },
    "observability": { "score": 4, "weight": 0.1, "notes": "" }
  },
  "total": 82,
  "verdict": "NOT_READY",
  "open_p0": 1,
  "journeys": { "J1": "pass", "J2": "pass", "J3": "fail", "J8": "partial" }
}
```

## Verdict labels

| Total | Label |
|-------|-------|
| ≥ 85, no dim < 3, P0 = 0 | **READY** |
| 75–84 | **NEAR** — fix P0/P1 then regression |
| 60–74 | **RISK** — not ship recommended |
| < 60 | **NOT READY** |
