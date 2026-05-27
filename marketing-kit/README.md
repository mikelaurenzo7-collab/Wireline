# Wireline marketing kit

Generated for **trywireline.com** — use on the site, social, paid ads, and sales decks.

## Open this folder

| Folder | Use |
|--------|-----|
| `screenshots/production-public/` | **Live production** — auth, compare, pricing (use on website hero) |
| `screenshots/desktop/` | 1920×1080 — web sections, LinkedIn, deck |
| `screenshots/reel/` | 1080×1920 vertical stills — Stories / Reels cover frames |
| `screenshots/mobile/` | 390×844 — mobile web, App promos |
| `zoom-crops/` | Detail shots — zoom/pan in CapCut or Premiere |
| `videos/` | Screen recordings (WebM) — import and add music |
| `copy/` | Headlines, hooks, carousel order |

## Reels (edit these WebMs)

1. **reel-operator-console** — Triage → Integrations → Agents → Logs (vertical 9:16 source)
2. **reel-compare-pan** — Horizontal pan across competitor matrix
3. **reel-auth-to-triage** — Auth hero → signed-in triage (desktop 16:9)

Suggested edit: 0.5s cuts, brand purple `#4F1E7B` lower-third, CTA “trywireline.com” last 2s.

## Call recordings

Demo account has **24 seeded calls with summaries** but no `recording_url` in DB yet. For website audio:

- Record a call to **(630) 581-1834** (live demo line), or
- Sign in to the demo account and export from **Logs**.

## Re-run captures

```bash
# Production public only (works today)
# Already in screenshots/production-public/

# Full kit (local Vite + rich mocks)
E2E_BASE_URL="http://127.0.0.1:3000" MARKETING_USE_MOCKS=1 npm run marketing:kit

# Full kit on production (requires demo credentials in env)
E2E_BASE_URL="https://trywireline.com" \
  DEMO_EMAIL="composer.demo@trywireline.com" \
  DEMO_PASSWORD="$DEMO_PASSWORD" \
  npm run marketing:kit
```

## Git

Videos are gitignored (`marketing-kit/videos/`). Commit PNGs selectively or upload to CDN.
