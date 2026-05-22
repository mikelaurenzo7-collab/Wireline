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
| `copy/social-copy.md` | Headlines, hooks, carousel order |

## Reels (edit these WebMs)

1. **reel-operator-console** — Triage → Integrations → Agents → Logs (vertical 9:16 source)
2. **reel-compare-pan** — Horizontal pan across competitor matrix
3. **reel-auth-to-triage** — Auth hero → signed-in triage (desktop 16:9)

Suggested edit: 0.5s cuts, brand purple `#4F1E7B` lower-third, CTA “trywireline.com” last 2s.

## Call recordings

Demo account has **24 seeded calls with summaries** but no `recording_url` in DB yet. For website audio:

- Record a call to **(630) 581-1834** (live demo line), or
- After prod auth is fixed, sign in as `composer.demo@trywireline.com` and export from **Logs**.

## Re-run captures

```powershell
# Production public only (works today)
# Already in screenshots/production-public/

# Full kit (local Vite + rich mocks while prod /api/auth/signin is 500)
$env:E2E_BASE_URL = "http://127.0.0.1:5173"
$env:MARKETING_USE_MOCKS = "1"
npm run marketing:kit

# Full kit on production (when sign-in works)
$env:E2E_BASE_URL = "https://trywireline.com"
$env:DEMO_EMAIL = "composer.demo@trywireline.com"
$env:DEMO_PASSWORD = "..."  # docs/DEMO_ACCOUNT.md
Remove-Item Env:MARKETING_USE_MOCKS -ErrorAction SilentlyContinue
npm run marketing:kit
```

## Git

Videos are gitignored (`marketing-kit/videos/`). Commit PNGs selectively or upload to CDN.
