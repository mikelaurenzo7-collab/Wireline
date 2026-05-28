# Wireline — PRD & Architecture Log

## Original Problem Statement
1. **Refactoring (Session 1)**: Refactor three monolithic "God Components" (InsightsView.tsx, OutboundDialer.tsx, FleetSettings.tsx — each ~1800+ LOC) into domain-specific sub-component folders. Close the API validation gap.
2. **Landing Page Redesign (Session 2)**: Complete redesign from scratch. Multiple redundant sign-in/sign-up buttons, cut-off text, poor aesthetics. Perfect editorial aesthetic with immense attention to detail.

## Architecture
- **Stack**: TypeScript, Vite, Express, React, Drizzle ORM, PostgreSQL, Zod
- **Monorepo**: Single `/app` directory with `server.ts` (Express) and `src/` (React + shared)
- **Design System**: "Aurora Cream" — Fraunces italic serif (display), DM Sans (body), IBM Plex Mono (code). Brand purple #4F1E7B, warm cream #EFE9DC, ink #1A1614

## What's Been Implemented

### Session 1 (2026-01-28): God Component Refactoring + API Validation

#### InsightsView.tsx — 1908 → 143 LOC (92.5% reduction)
- 10 sub-views in `/components/insights/`

#### OutboundDialer.tsx — 1859 → 1509 LOC (18.8% reduction)
- CallbacksList + CreateCampaignModal + shared constants in `/components/outbound/`

#### FleetSettings.tsx — 1798 → 1568 LOC (12.8% reduction)
- AgentListPanel + CreateAgentSection in `/components/fleet-settings/`

#### API Validation: 6 → 11 routes validated, 17 new Zod schemas

### Session 2 (2026-01-28): Landing Page Redesign

#### LandingPage.tsx — Complete rewrite
- **Hero**: Full-viewport with massive Fraunces italic heading, 3D sphere decorative background, single clear CTA
- **Proof Tiles**: Editorial grid with 1px borders between cells, large serif numbers (24/7, <10m, 0)
- **Agent Directory**: Asymmetric bento grid (featured agent 8-col, rest 4-col), tel: clickable cards
- **Final CTA**: Centered "Ready to run your fleet?" with single conversion button
- **Footer**: Dark inverse theme (#1A1614) with 4-column layout (Brand, Product, Company, Legal)

#### PublicSiteHeader.tsx — Redesigned
- Scroll-aware glass effect (transparent → blurred on scroll)
- Single "Start trial" CTA + "Sign in" text link (eliminated all CTA redundancy)
- Clean 4-link desktop nav (Pricing, Demos, Compare, About)
- Hamburger mobile menu with proper overlay

#### Key fixes:
- Eliminated 5+ redundant auth CTAs → reduced to strategic 3 (header, hero, footer)
- Fixed cut-off text — proper section padding throughout
- Removed MarketingStickyCta from landing (replaced by inline design)
- Removed MarketingFooter from landing (replaced by custom dark footer)

## Testing
- TypeScript: 0 new errors from refactored files
- Frontend: 100% pass — all features verified across desktop, tablet, mobile
- All data-testid attributes present on interactive elements

## Prioritized Backlog

### P0 — Authenticated page improvements
- Scan all authenticated routes for design/layout issues
- PageShell consistency audit
- Sidebar navigation polish

### P1 — Remaining component extractions
- OutboundDialer: DispatchTab + CampaignsTab
- FleetSettings: AgentConfigPanel (~1000 LOC)

### P2 — Remaining validation + admin routes
- Wire remaining Zod schemas to middleware
- Admin route validation (20+ mutations)
