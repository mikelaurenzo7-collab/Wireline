# App-Wide UI/UX Audit — June 2026

**Scope:** every client-facing surface — marketing pages, auth, and the
authenticated console (`src/pages/`, `src/components/`, layout shell,
navigation contract). Conducted against `main` @ `91b4261e`.

**Method:**

1. Static audit of design-system adherence (DESIGN.md / Rich Cream + Purple),
   accessibility, responsive architecture, and UX states across all pages
   and ~260 component files.
2. Live visual review of the running app (public + auth surfaces) at
   390 px and 1440 px via headless Chromium, including horizontal-overflow
   and console-error sweeps. Authenticated surfaces were audited at the
   code level only (this environment cannot reach Postgres, so live data
   states could not be exercised).
3. Executed the design ratchet suite to verify claimed violations.

**Overall:** the codebase is in strong shape — the shadcn ratchet
baselines hold at 0 for raw controls and `.glass`, Director components use
the design contract consistently (83 contract references, 0 off-contract
classes), channel pages share an exemplary loading/empty/error contract,
reduced-motion is handled globally, and no page overflows horizontally at
390 px. The findings below are the divergent tail, ordered by impact.

---

## P0 — Broken contract / CI

### 1. Design ratchet failing on `main` (fixed in this PR)

`shadcn-pivot-ratchet` `largeRadius` baseline is 0, but 3 literals shipped
(2 in `src/pages/LandingPage.tsx:179,258` via today's hero commits, 1 in
`src/pages/Showcase.tsx:87`). `npm run test:design`-adjacent CI fails.
**Fixed in this PR** — all three switched to `rounded-md` (visual no-op:
the global `border-radius: 0` reset makes large-radius classes dead).

### 2. Off-brand parallel purple palette — `src/constants/brand-colors.ts`

`BRAND.purple = #8B3FD6` (and `purpleLight = #8B3FD6`) does not match the
canonical `--color-brand #4F1E7B`; `BRAND.cream = #F5F0E6` differs from
`--color-paper #EFE9DC`. This object feeds inline styles and route accents
in **30 files / 99 references** (Pipeline, StripeBillingCard,
ContactProfile, AuditActivityPanel, wireline-ops-design.ts…), so a
visibly brighter/bluer purple renders throughout the authed app,
bypassing the token system.
**Fix:** reconcile to `#4F1E7B`, or rename/document `#8B3FD6` as the
intentional "luminous on dark" accent so it stops being used as the
primary brand fill.

---

## P1 — High

### 3. Keyboard-inoperable interactive cards (a11y)

Clickable `<div>`s with `onClick` but no `role` / `tabIndex` /
`onKeyDown` — mouse-only:

- `src/components/AgentActionEngine.tsx:174-185` (tool-toggle card)
- `src/components/AgentFlowComposer.tsx:725-733` (pipeline step selector)

**Fix:** convert to `<ShadButton variant="ghost" …>` tiles or add
`role="button"` + `tabIndex={0}` + Enter/Space handling (good in-repo
examples: `ActionFeed.tsx:171`, `CallLogs.tsx:996`).

### 4. Recipe form labels not associated with inputs (a11y)

The shared `Field` primitive in `src/components/recipes/shared.tsx:30-57`
renders a bare `<label>` (no `htmlFor`) beside a `TextInput` with no `id`.
Screen readers announce nothing on focus. Because every recipe form
composes from this primitive, the defect fans out across ~12 forms.
**Fix:** thread a generated `id` through `Field` → `htmlFor` → input
(see `admin/CarrierPanel.tsx:154-190` for the correct pattern).

### 5. Scroll containers missing `.scroll-viewport` (locked-viewport contract)

~16 in-app panels scroll with bare `overflow-y-auto` and no overscroll
containment, so hitting the end chains into the locked shell
(rubber-band trap on tablets):
`AgentTraining.tsx:390,914,929,944`, `TriageInbox.tsx:263,864`,
`admin/CarrierPanel.tsx:107`, `admin/VoiceLibraryPanel.tsx:158`,
`PronunciationDictionaryPanel.tsx:201`, `AgentMemoryPanel.tsx:86`,
`AgentFlowComposer.tsx:709,813`, `Cadences.tsx:266`,
`RoleplaySandbox.tsx:220,295`, `outbound/CallbacksList.tsx:75`.
**Fix:** mechanical — add `.scroll-viewport` (or `overscroll-contain`)
to each. CommandCenter / Insights / channel inboxes already do this right.

### 6. Insights surface diverges from the app's loading/error contract

All ~11 Insights views (`QualityView`, `TopicsView`, `LeaderboardView`,
`HeatmapView`, `FailureModesView`, `AISpendView`, `FunnelView`,
`VoiceLatencyView`, `AttributionView`, `VoiceReliabilityView`,
`LearningMetricsView`):

- load with a custom centered `Spinner` (`insights/shared.tsx:28-41`)
  instead of layout-matched Skeletons → layout shift + inconsistency with
  the channel pages' `PanelSkeleton` standard;
- fail into a static `ErrCard` (`insights/shared.tsx:105-115`) with **no
  retry affordance** — the user must reload the page.

**Fix:** add an `InsightSkeleton` and an `onRetry` prop on `ErrCard`
wired to each view's fetch.

### 7. `console.*` instead of structured `clientLog` in feature code

~30 sites in client `.tsx` (of ~74 total `console.*` in `src/`), e.g.
`AdminSettings.tsx:220,310,330`, `AgentTraining.tsx:252,266`,
`fleet-settings/FleetSettings.tsx:146,176`, `CommandCenter.tsx:325`,
`RoleplaySandbox.tsx:201`. Violates the logging convention and drops
failures from structured telemetry. (Infra exceptions — `main.tsx`,
ErrorBoundary — are fine.)

### 8. Raw CSS files outside `src/index.css` + doc drift

The rule is "no raw CSS outside `src/index.css`", but 7 files exist and
are imported (`src/styles/app-shell.css`, `legacy-aliases.css`,
`wireline-design-system.css` (~5,800 lines), `design-preview.css`,
`auth-contrast.css`, `integrations/preview-cards.css`,
`client-overrides.css`, plus `public/app-shell.css`).
`.github/skills/wireline-design/SKILL.md` already documents the
`src/styles/*` split — i.e. the docs disagree with DESIGN.md.
**Fix:** amend DESIGN.md to bless `src/styles/*` (realistic) or plan a
consolidation; either way, kill the drift.

---

## P2 — Medium

### 9. `border-white/*` on cream — 187 occurrences, kept alive by a CSS escape hatch

Forbidden by DESIGN.md, yet 187 occurrences across 58 files
(StripeBillingCard ×10, CreateCampaignModal ×9, CommandBar ×8,
Developers ×8…). They only render acceptably because
`wireline-design-system.css:5853-5874` remaps `border-white/N` to purple
tints in light mode — an override layer legalizing the anti-pattern.
**Fix:** migrate to `border-black/8` / `border-ink/[0.08]` / `.wl-panel`,
delete the rescue CSS, and add a `border-white/` ratchet so the count
only falls.

### 10. Mobile nav drawer violates the bottom-sheet contract

The primary mobile navigation slides in from the left
(`TopBar.tsx:546-553` + edge-swipe zone `AppShell.tsx:356-383`), while
DESIGN.md §3b mandates bottom sheets with drag handles for mobile panels —
a pattern the app itself implements perfectly elsewhere
(`PageShell.tsx:406-425`, `AppPageIntro.tsx:93-106`).
**Fix:** convert, or grant an explicit written exception (left nav drawer
is a defensible convention) — currently it just contradicts the contract.
Related: DESIGN.md says the viewport locks `<xl`, but the implementation
locks at `md` with the rail at `lg` (`wireline-design-system.css:4911`,
`AppShell.tsx:332,398`) — reconcile §3b with the `md`/`lg` reality.

### 11. Destructive-action confirmation is inconsistent

Three flavors coexist:

- **No confirmation at all:** `fleet-settings/AgentConfigPanel.tsx:176-189`
  (delete rule), `AgentTraining.tsx:215` (delete knowledge entry),
  `SupervisedAgentTuner.tsx:128` (delete lesson) — instant deletes.
- **Native `window.confirm()`** (unstyled, blocks main thread) at 9 sites:
  `Cadences.tsx:219`, `PronunciationDictionaryPanel.tsx:157`,
  `admin/VoiceLibraryPanel.tsx:140`, `AgentWorkspace.tsx:525`,
  `DirectorWorkspace.tsx:1034,1164`, `PainterWorkspace.tsx:195`,
  `CrmConnectionCard.tsx:295`, `AgentFlowComposer.tsx:391`.
- **The canonical `ConfirmModal`** (FleetSettings, OutboundDialer,
  Appointments) and Undo-toast (DncManager) — the right patterns.

**Fix:** route all of the above through `ConfirmModal` (or Undo toast).

### 12. Silent mutations in WebhooksManager

`discardDelivery` (`WebhooksManager.tsx:352-360`), `remove` (372-380) and
`toggleActive` (381-387) give no success/error toast; failures vanish.
**Fix:** add `toastSuccess`/`toastError` + `catch`.

### 13. `SectionHeader` is unused; marketing headers are hand-rolled

`SectionHeader` (the canonical pattern per DESIGN.md §2) has **zero**
consumers outside its own file and `EmptyState`. Every marketing page
hand-rolls `<h2 className="font-display italic text-3xl sm:text-4xl …">`
with inconsistent sizes/margins (`About.tsx`, `Blog.tsx`, `Compare.tsx`,
`Showcase.tsx`, `LandingPage.tsx`). Separately, `font-display italic`
appears ~25× even though the slanted face is retired (it renders upright
only via the global `.italic` neutralizer).
**Fix:** adopt `SectionHeader` (or a marketing variant) and drop the dead
`italic` classes.

### 14. Unsaved-changes protection exists on exactly one editor

`AgentFlowComposer` has dirty-tracking + autosave + `beforeunload`
(`AgentFlowComposer.tsx:500-531`). `AdminSettings` (large multi-field
form) and `fleet-settings/AgentConfigPanel` lose edits silently on
navigation. **Fix:** mirror the AgentFlowComposer pattern or a router
blocker.

### 15. Icon-button accessible-name long tail + `after:hidden` hit-area removals

- `recipes/forms/PersonaCloneForm.tsx:53-62` — icon-only close with **no**
  `aria-label`/`title`; ~5–10 more rely on `title` only
  (`ui/ArtifactCard.tsx:176`, `fleet-settings/AgentConfigPanel.tsx:383`).
- ~11 buttons use `after:hidden`, deleting ShadButton's built-in 44 px hit
  expansion; worst is `HelpTooltip.tsx:68` (16 px target), plus
  `ArtifactCard.tsx:178` and `CrmConnectionCard.tsx:450` (32 px).

**Fix:** add `aria-label`s; drop `after:hidden` unless the visual is
already ≥44 px.

### 16. Authenticated axe coverage doesn't open anything

`tests/e2e/authenticated-axe.spec.ts` scans only the default tab of
`/chat`, `/ops`, `/phone`, `/admin`. Modals (recipe forms,
DeployAgentModal, CreateCampaignModal), deep tabs, and AgentFlowComposer
are never scanned — findings #3 and #4 above are invisible to CI.
**Fix:** add axe passes after opening representative modals/tabs.

---

## P3 — Low / polish

- **Hardcoded hex bypassing tokens (~4 real cases):**
  `marketing/BrowserCallWidget.tsx:144` (`#1A1614`/`#EFE9DC` instead of
  `bg-ink text-paper`), `auth/AuthDemoDirectory.tsx:32`,
  `integrations/PreviewCards.tsx:194`, `ErrorBoundary.tsx:56`.
- **Ad-hoc inline empty states (~8):** `CallLogs.tsx:391,770`,
  `AgentBusinessProfile.tsx:749`, `AgentFlowComposer.tsx:713`,
  `insights/VoiceReliabilityView.tsx:317,336`, `CommandBar.tsx:560` —
  route through `InlineEmpty` / `EmptyState`.
- **Nav contract drift** (`src/constants/navigation.ts`): `g t` →
  `/ops?tab=triage` has no `NAV_SHORTCUT_HINTS` entry (undiscoverable);
  `/pipeline` is the only rail sibling without a shortcut; `/status`,
  `/changelog`, `/security`, `/trust/:vertical`, `/design/preview` lack
  `PAGE_TITLES` entries (breadcrumb falls back to "Command").
- **`MobileBottomNav.tsx` is intentionally dead code** — delete or revive;
  today the hamburger drawer is the only mobile path to Insights,
  Pipeline, Email, SMS, Training (two taps minimum, no quick-switch).
- **Silent `.catch(() => {})` fire-and-forgets (~10):** `SmsThreads.tsx:138,172,229`,
  `CommandCenter.tsx:250`, `EmailVerifyBanner.tsx:39`, `TrialBanner.tsx:48` —
  at minimum `clientLog.error` in the catch.
- **No stale-data indicator** on CommandCenter live stats during SSE
  outages (polling backs off to 30 s silently) — consider a "last
  updated" badge on OpsPulseStrip.
- **Developers page code block contrast:** the `curl` sample renders
  low-contrast purple-on-gray and the slab clashes with the cream
  palette (`src/pages/Developers.tsx`, observed in live review at
  1440 px).
- **Mobile chrome stacking (live review):** on `/pricing` and `/compare`
  at 390 px, the sticky section-tab strip + cookie banner + sticky CTA
  bar can occupy ~35–40 % of the viewport simultaneously; consider
  collapsing the CTA bar while the cookie banner is visible.
- **Tiny/low-contrast metadata:** `text-[10px]` ×365 and
  `text-ink/40`-class opacities ×193 — fine for true metadata; spot-check
  anywhere it's the only presentation of essential info
  (`AgentConfigPanel`, `CarrierPanel`, `CallLogs` are the heaviest users).
- **`YoureLiveModal`** hides the default Radix close button
  (`[&>button.absolute]:hidden`); Esc works, but verify a visible,
  labeled close affordance exists.

---

## What's verifiably healthy (keep doing this)

- **Ratchets hold:** raw `<button>/<input>/<select>/<dialog>` = 0,
  `.glass` in feature code = 0, flat `bg-brand` CTAs = 0.
- **Director** uses `WL_DIRECTOR_CLASSES`/`WL_APP_CLASSES` everywhere.
- **Channel pages** (CallLogs, EmailInbox, SmsThreads, Pipeline) share a
  consistent Skeleton → EmptyState → toast-error → Refresh contract.
- **ShadButton hit targets** are ≥44 px by construction; focus rings are
  consistently paired with `outline-none`; 261 `aria-hidden` usages on
  decorative elements; CommandBar is a textbook accessible combobox.
- **Reduced motion** honored globally (38+ CSS blocks + `useReducedMotion`).
- **Responsive architecture:** master-detail channels swap correctly with
  Back buttons, LiveFloorPanel has true mobile equivalents for `xl`-only
  panels, safe-area insets are everywhere, and no page overflows
  horizontally at 390 px (verified live).
- **Three-level error boundaries** (app / route / widget) and a single
  consistent ToastContext.

## Suggested sequencing

1. ✅ Radius ratchet fix (this PR).
2. Brand purple reconciliation (#2) — highest visual-correctness impact.
3. The two a11y highs (#3, #4) + axe coverage (#16) so they stay fixed.
4. Mechanical sweeps: `.scroll-viewport` (#5), `clientLog` (#7),
   `ConfirmModal` migration (#11).
5. Insights loading/error contract (#6).
6. Contract reconciliation: DESIGN.md vs `src/styles/*` (#8), bottom-sheet
   vs nav drawer + `md`/`xl` breakpoint language (#10).
7. `border-white/*` migration with a new ratchet (#9).
