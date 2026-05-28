# Wireline — PRD & Architecture Log

## Original Problem Statement
1. **Session 1**: Refactor 3 God Components + add API Zod validation
2. **Session 2**: Complete landing page redesign from scratch
3. **Session 3**: Remove 3D sphere image, implement editorial sharp-edge aesthetic app-wide, upgrade fonts for maximum readability and character

## Architecture
- **Stack**: TypeScript, Vite, Express, React, Drizzle ORM, PostgreSQL, Zod
- **Monorepo**: Single `/app` directory
- **Design System**: "Old Money Tech" editorial — Fraunces italic serif (display), Plus Jakarta Sans (body), JetBrains Mono (mono). Brand purple #4F1E7B, warm cream #EFE9DC, ink #1A1614. Zero border-radius on all app surfaces.

## What's Been Implemented

### Session 3 (2026-01-28): App-Wide Aesthetic + Font Upgrade

#### Font Upgrade
- **Body**: DM Sans → **Plus Jakarta Sans** — warmer geometric with better weight range (200-800), beautiful character at all sizes, pairs perfectly with Fraunces serif
- **Mono**: IBM Plex Mono → **JetBrains Mono** — most legible monospace font, designed for code/data contexts
- **Display**: Fraunces retained (already excellent)
- Added `font-feature-settings: "cv11", "ss01"` for optimal Plus Jakarta Sans rendering

#### Landing Page
- Removed 3D sphere image entirely — hero is pure typography + negative space
- Sharp-edge buttons (no border-radius)

#### Auth Pages (signin/signup)
- Context-aware header: hides "Start trial" on /signin, hides both CTAs on /signup
- Sharp-edge auth card, OAuth buttons, toggle switch, submit button, alerts
- Lighter input backgrounds (bg-white/60 → bg-white/80 on focus) via CSS specificity fix
- Subtler background gradient (opacity 0.12 → 0.06)

#### Pricing Page
- Sharp edges on ALL cards: tier cards, "Why Wireline" cards, value bullet cards, role replacement cards
- Sharp edges on buttons, badges, icon containers
- "MOST POPULAR" badge sharp

#### Authenticated App (Global CSS)
- `brutal-btn` — removed rounded-xl
- `brutal-border` / `brutal-border-lg` — removed rounded-xl/2xl
- `brutal-card` — removed rounded-2xl
- `marketing-panel` / `marketing-panel-muted` — removed border-radius: 1rem
- `marketing-btn-primary` / `marketing-btn-secondary` — removed border-radius: 9999px
- `tab-toggle-surface` — removed rounded-2xl
- `chip-brand` — removed rounded-full
- `empty-state-icon` — removed rounded-2xl
- `panel-mobile-surface` — removed border-radius: 1.125rem
- PageShell `Panel` — removed rounded-xl
- PageShell `StatTile` — removed rounded-xl
- PageShell desktop/mobile tabs — removed rounded-lg/xl
- PageShell mobile actions sheet — removed rounded-t-[1.35rem]
- AppShell `DesktopContextBar` keyboard shortcut button — removed rounded-full
- Auth input CSS specificity fix (global input[type] was overriding .auth-input bg)

### Session 2 — Landing page rewrite (complete)
### Session 1 — God component refactoring + API validation (complete)

## Testing
- Session 3: 100% frontend pass after fixes (all 3 issues from iteration 3 resolved)
- Font verified: Plus Jakarta Sans body, Fraunces display, JetBrains Mono mono
- Sharp edges verified: all glass/card elements at 0px border-radius
- Auth input bg verified: rgba(255,255,255,0.6) confirmed
- Context-aware header: /signin hides Start trial, /signup hides both CTAs

## Prioritized Backlog

### P1 — Remaining component extractions
- OutboundDialer: DispatchTab + CampaignsTab
- FleetSettings: AgentConfigPanel (~1000 LOC)

### P2 — Remaining validation + admin routes
- Wire remaining Zod schemas to middleware
- Admin route validation (20+ mutations)
