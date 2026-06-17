# Project: trywireline.com Authenticated Views Redesign

## Architecture
- **Web App Chrome**: `AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`, and `WorkspaceTopBar.tsx` form the core chrome. Pinned to a locked viewport (`100dvh`, no document scroll) at all sizes.
- **Sub-pages/Tabs**:
  - CommandCenter/LiveOps (`/ops`)
  - Studio/FleetSettings (`/agents`)
  - Channels (`/phone`, `/email`, `/sms`)
  - Settings (`/admin`, `/integrations`, `/dnc`, `/audit`)
  - Profile & Account settings
- **Design Tokens**: Standardized on Rich Cream (`#EFE9DC`) + Silky Purple (`#4F1E7B`). Zero radius reset (razor-edge visual except `rounded-md` for intentional flatness). Static ratchets in `shadcn-pivot-ratchet.test.ts` and `wireline-design-audit.test.ts` enforce design system rules.
- **Shared Contracts**: API routes fetch from `/api/*` and return typed objects. E2E tests verify page routing, responsiveness, accessibility, and design system compliance.

## Code Layout
- `src/components/layout/`: AppShell, Sidebar, TopBar, WorkspaceTopBar
- `src/components/`: Component page views (AdminSettings, FleetSettings, CommandCenter, etc.)
- `src/pages/`: Page containers (PhonePage, CommandCenter, etc.)
- `src/components/ui/shadcn/`: Primitive UI components (ShadButton, Card, Input, Tabs, etc.)
- `tests/e2e/`: Playwright E2E tests

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Core Layout Redesign | Redesign AppShell, Sidebar, TopBar, and WorkspaceTopBar for simplified premium visual aesthetic and laptop/desktop responsiveness | none | PLANNED |
| 2 | CommandCenter Redesign | Redesign CommandCenter (/ops) page and subtabs (intel, triage, analytics) to align with premium look | M1 | PLANNED |
| 3 | Studio Redesign | Redesign FleetSettings/Studio (/agents) workspace views to match the updated aesthetic | M1 | PLANNED |
| 4 | Channel Pages Redesign | Redesign PhonePage (/phone), EmailPage (/email), and SmsPage (/sms) for visual simplification | M1 | PLANNED |
| 5 | Settings & Admin Redesign | Redesign AdminSettings (/admin) and Integrations (/integrations) views | M1 | PLANNED |
| 6 | Test & Contract Alignment | Update vitest specs and mock contracts to align with UI component changes; verify all tests pass | M1, M2, M3, M4, M5 | PLANNED |
| 7 | Mobile & Widgets Perfection | Perfect iOS widgets extension, CarPlay communication templates, Siri/Shortcuts plan, and Android build & layout | M1, M6 | PLANNED |
| 8 | Final E2E & Cross-Platform Verification | Ensure Playwright E2E suites and cross-platform verification pass cleanly; run Challenger & Forensic Auditor gates | M6, M7 | PLANNED |

## Interface Contracts
### Client Console & Shell Layout
- AppShell controls responsive side drawer for mobile (<lg) and permanent narrow icon rail (56px) for desktop (lg+).
- Sub-tabs are managed via `AppChromeSubTabs.tsx` and URL query params (`?tab=...`).
- Page context is passed through AppShell's `getPageContext` helper to output title/subtitle details.

