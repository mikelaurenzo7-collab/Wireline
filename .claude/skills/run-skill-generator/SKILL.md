# run-skill-generator — Wireline Full-App Stress Test & Dogfood Skill

Use this skill to perform a comprehensive, deep stress test of every Wireline
feature as a heavy user would — covering Director Chat (all toolbar modes,
Stitch gallery, model picker, coach, connections, capabilities, deep analysis),
every Agents sub-tab, Training, Ops, Insights (all 9 view tabs), Integrations,
Admin settings, and all marketing pages.

The skill:
1. Builds the app and serves the static bundle
2. Runs `stress-test.mjs` — a Playwright script that seeds rich mock data
   for every endpoint, navigates every route + sub-tab, interacts with all
   key UI elements (dropdowns, toggles, tabs, modals, galleries), screenshots
   every state, and emits a JSON findings report
3. Claude reads the report, identifies UI/UX issues, fixes them, re-runs, and
   reports the results to the user

## Prerequisites

```bash
apt-get update && apt-get install -y curl
npx playwright install --with-deps chromium
npm install
```

## Running the stress test

```bash
# 1. Build
npm run build

# 2. Serve the static bundle (needed in network-restricted environments)
npx vite preview --port 4173 --host 127.0.0.1 &
sleep 2

# 3. Run the stress test (outputs to /tmp/wireline-stress/)
node .claude/skills/run-skill-generator/stress-test.mjs

# 4. (Optional) Run only specific suites
STRESS_SUITES=chat,agents,training node .claude/skills/run-skill-generator/stress-test.mjs

# 5. Review the findings report
cat /tmp/wireline-stress/findings.json | jq '.summary'
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `STRESS_URL` | `http://127.0.0.1:4173` | Base URL |
| `STRESS_OUT` | `/tmp/wireline-stress` | Screenshot + report output dir |
| `STRESS_SUITES` | all | Comma-separated list of suites to run |
| `STRESS_VIEWPORT` | `1440x900` | Viewport for primary run |
| `STRESS_HEADED` | unset | Set to `1` for visible browser |

## Test suites

| Suite | What it exercises |
|---|---|
| `chat` | Director Chat: all 4 conversation scenarios, model picker, connectors panel, capabilities catalog, deep-analysis toggle, coach chip, Stitch gallery (Screenshot/Live HTML/Export/device tabs) |
| `agents` | Template gallery (search, all 7 category filters), MY FLEET tab with 5 rich agents, agent row hover state |
| `training` | All 5 sub-tabs (Knowledge, Voices, Pronunciation, Simulator, Flow) with content mocked |
| `ops` | Live Floor, Actions, Analytics tabs; fleet pulse + escalations panels |
| `insights` | All 9 view tabs (Funnel, Goals, Attribution, Topics, Heatmap, Leaderboard, Failures, Latency, AI Spend); all 5 day-window selectors |
| `integrations` | Email carriers list, connected-stack, sync button; carrier tab sub-views |
| `admin` | Branding, Team, Billing, Carrier, Activity, Audit sub-tabs |
| `marketing` | Landing, Pricing (monthly/annual toggle), Compare, Showcase, About, Support, Developers |
| `auth` | Sign-in, Sign-up pages; form validation states |
| `responsive` | Key routes at mobile (390), tablet (834), desktop (1440) |

## Output structure

```
/tmp/wireline-stress/
  findings.json          # summary + per-step results (errors, timing, flags)
  report.html            # rich HTML report with screenshots + findings inline
  screenshots/
    <suite>--<step>.png  # one shot per test step
```

## Interpreting findings.json

```json
{
  "summary": {
    "total": 80,
    "passed": 76,
    "flagged": 4,
    "errors": 1,
    "durationMs": 42000
  },
  "steps": [
    {
      "suite": "chat",
      "step": "Stitch gallery — Screenshot tab",
      "passed": true,
      "durationMs": 420,
      "errors": [],
      "flags": []
    },
    {
      "suite": "insights",
      "step": "Heatmap — 30d window",
      "passed": true,
      "durationMs": 380,
      "errors": [],
      "flags": ["BOTTOM_DEAD_SPACE_82px"]
    }
  ]
}
```

**Flags to act on:** `BOTTOM_DEAD_SPACE_>100px`, `CONSOLE_ERROR`, `ELEMENT_NOT_FOUND`,
`INTERACTION_FAILED`, `LAYOUT_CLIP`.

**Safe to ignore:** `BOTTOM_DEAD_SPACE_<60px`, `ERR_FAILED` (aborted off-origin fonts),
`EventSource MIME type` (ops SSE mock).

## Workflow for Claude

1. Run the stress test (steps above)
2. Read `/tmp/wireline-stress/findings.json` — focus on flagged steps
3. View flagged screenshots in `/tmp/wireline-stress/screenshots/`
4. Fix any issues found in the source files
5. Rebuild and re-run just the affected suites with `STRESS_SUITES=<suite>`
6. If all suites pass, commit the fixes and report to the user

## Updating the skill

When new routes, sub-tabs, or components are added to Wireline, extend the
`TEST_PLAN` array in `stress-test.mjs` and add matching mock data to `mockApi()`.
