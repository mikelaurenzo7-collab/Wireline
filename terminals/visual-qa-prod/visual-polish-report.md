# Visual UI/UX QA — Production (trywireline.com)

**Account:** wireline.demo@trywireline.com  
**Method:** Playwright screenshot sweep (24 routes × mobile + desktop) + live browser inspection  
**Artifacts:** `screenshots/`, `visual-qa.json`, `scripts/visual-ui-qa.mjs`

## Executive summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 | 0 | No broken layout, overflow, or off-brand hues |
| P1 | 6 | Visual density, CTA weight, redundant chrome |
| P2 | 5 | Micro-spacing, tab fade, bottom-nav depth |

**Overall:** Product is on-brand (cream paper, purple accents, editorial serif headings). Standouts: **Triage** empty cards, **Live Ops** floor, **Phone** mobile tabs. Main visual gaps were **heavy editorial shadows** on list CTAs, **duplicate connect buttons** on Integrations empty state, and **sub-10px labels** on Agents/Integrations/Admin surfaces.

## What passed visually

- Aurora rail + cream canvas hold across all routes
- Mobile bottom nav (Ops · Chat · Phone · More) reads clearly; active state is obvious
- Triage status badges (COLD FLOOR, QUEUE CLEAR) — strong hierarchy
- Insights empty funnel card — centered, halo icon, clear primary/secondary CTAs
- Training buffer structure — brain icon, observation cards, readable mono body
- Director desktop — calm thread, artifact panel, composer toolbar aligned
- No horizontal overflow on any route (390 / 1440)

## P1 — visual issues found & fixed (local)

| Issue | Route | Fix |
|-------|-------|-----|
| Promote / Deploy buttons use heavy editorial drop shadow | Training, Agents | `default` variant + `shadow-sm`; softer card hover |
| Integrations empty: triple primary + header chip duplicates | `/integrations` | Hide panel chips when empty; one primary CTA in empty state |
| 47–58 sub-10px nodes | Agents, Integrations, Outbound | PreviewCards, CampaignsTab, Dnc, Growth → 10px floor |
| Director subtitle clips on mobile | `/chat` | `min-w-0` + `truncate` on header; tighter mobile padding |
| Content tight against bottom nav | All mobile | Stage wrapper `pb-[calc(3.75rem+safe-area)]` |
| Tab strip cut-off with no fade cue | Insights, Training, Admin | `tab-strip-scroll--fade` mask on mobile |

## P2 — polish applied

- Workspace top bar: +0.5rem vertical breathing room on mobile
- Mobile bottom nav: subtle upward shadow for separation
- Fleet toolbar “Template gallery” → `wl-label` styling
- Training Promote row stacks on narrow viewports (no overlap with label)

## P2 — deferred (optional next pass)

- Insights: group Funnel/Goals under “Performance” parent tab
- Chat: fleet roster table could switch to stacked cards <480px
- Integrations preview mini-mocks: still use inline hex (marketing-style cards)
- Email toolbar “100/100” — quota counter, not thread count (document in help)

## Screen scores (visual craft 1–5)

| Route | Mobile | Desktop | Notes |
|-------|--------|---------|-------|
| /triage | 5 | 5 | Reference empty-state craft |
| /ops | 4 | 5 | Pulse strip strong; floor serif label slightly loud |
| /chat | 4 | 5 | Table dense on mobile |
| /training | 4 | 4 | Promote CTA was heaviest element — fixed |
| /agents | 3→4 | 4 | Gallery chips dense; deploy shadow softened |
| /integrations | 3→4 | 4 | Redundant CTAs removed when empty |
| /insights | 4 | 4 | Tab scroll OK with fade |
| /phone | 5 | 4 | Mobile tabs excellent |
| /admin | 4 | 4 | Activity ledger readable after type pass |

## Re-run

```bash
node scripts/visual-ui-qa.mjs --base https://trywireline.com
```
