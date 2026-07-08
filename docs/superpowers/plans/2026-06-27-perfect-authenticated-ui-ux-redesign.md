# Perfect Authenticated UI/UX, Routing, and IA Architecture Redesign for Wireline

**Date:** 2026-06-27 (Updated Masterclass Redesign)
**Status:** COMPLETE — First merge done; final polish + thin agent bar + wire branding + recipe rename + fixes + contracts green; second merge pending final validation.
**Note (2026-07):** Warm cream / forest-green palette described below is **retired**. Live product doctrine is **Aurora Letterpress** — obsidian canvas, electric violet action, silver wire (`wireline-design-vision.ts`, `surface-contract.ts`).
**Goal:** Masterclass redesign of authenticated pages for a professional, consistent, polished, non-chaotic, flawless experience. Persistent left side rail (DesktopRail) on *every* page including Studio. Clear, logical IA and routing that makes Create → Train → Run obvious and seamless. Consistent page structure using WorkspaceShell everywhere. User flows are frictionless, purposeful, and reinforce the product model. Pages feel like one cohesive, premium system under Wireline Letterpress. No "loses side rail", no inconsistencies, no amateur chaos. Public pages untouched. Keep current Letterpress colors: warm paper canvas, dark neutrals, forest green primary action, and status colors only for meaning.

This addresses the broken structure: Studio bypassing shell, chaotic layouts, poor IA, inconsistent navigation/headers/content, sloppy feel despite strong design system and prior elevation work (flywheel, ledger, responsive).

**Vision for Perfect System:**
- **Persistent Navigation & IA:**
  - Left rail always (Home/Overview, Fleet/Agents, Studio, Training, Wire/Actions, Inbox, Settings).
  - Clear hierarchy:
    - Overview: Fleet dashboard + quick studio entry.
    - Fleet: Agent roster and management.
    - Studio: The "Run" surface (agent context + workroom/chat + integrated outcomes ledger). Focused, no right rail (per contracts), but ledger visible and actionable.
    - Training: "Train" surface (agent selector + config rail + intelligence flywheel + assets).
    - Wire: Tools and integrations.
    - Inbox: Cross-channel messages.
    - Settings: Configuration.
  - Agent context always visible (header selector + URL params) when in agent-specific views.
- **Page Structure (Consistent, Professional):**
  - EVERY authenticated page: <WorkspaceShell> ... </WorkspaceShell>.
    - Provides: Left DesktopRail (persistent), main flex area with standardized header (eyebrow, title, agent context/actions), content with studio-card, consistent spacing/typography from tokens, responsive.
  - Studio special but integrated: No full-viewport bypass. Workroom content fits in main area (h-full min-h-0). Agent context bar inside or in shell header. Ledger integrated below chat or as purposeful section (no right rail).
  - Use consistent patterns:
    - TOOL-HOME for Overview.
    - TOOL-LIST for Agents.
    - CHAT-OPS (integrated) for Studio workroom.
    - TOOL-SETTINGS with internal rail for Training.
    - Etc.
  - No chaos: Same card styles, button hierarchy (1 primary), microcopy (verbs, model language), states (loading/empty/error/success everywhere), focus rings, touch targets.
- **Routing:**
  - Clean, flat, predictable:
    - /overview (default authenticated home – use shell).
    - /agents (fleet roster).
    - /studio (studio surface; ?agent=ID&mode=workroom for direct chat, else roster/overview mode).
    - /training (training; ?agent=ID&section=facts etc.).
    - /actions (wire).
    - /inbox.
    - /settings, /settings/billing, /settings/team, /settings/customization, /settings/apps.
  - Query params for state (agent, mode, section, command) – bookmarkable, context-preserving.
  - Smart redirects for legacy (/ops -> /studio, /knowledge -> /training, /connections -> /actions).
  - No hijacking; always shell for authenticated.
- **Userflows (Seamless, Reinforce Model):**
  - Create: Short intake (dialog or dedicated) -> auto to /training?agent=xx with initial data populated + intelligence suggestions. Or direct to studio.
  - From Overview: Quick brief composer -> /studio?agent=xx&mode=workroom.
  - Run (Studio): Select agent (from rail or header) -> workroom chat. See live outcomes in ledger. "Brief/train from this outcome" -> prefill workroom or navigate to training with suggestion.
  - Train: See "Intelligence from outcomes" panel (real data from ledger). Apply one-click. Test calls. Back to studio seamlessly.
  - Context: Agent always known. Navigation between surfaces preserves agent.
  - Clear model language everywhere: "Create one.", "Train it.", "Run the work.", "Outcomes train the fleet."
- **Aesthetics & Polish (Keep System, Master the Structure):**
  - Exact current Wireline Letterpress colors/tokens: warm paper canvas, white/subtle surfaces, near-black text, forest green primary action, and status colors for meaning.
  - Consistent everything: studio-card, wl- classes, spacing (4px rhythm), type scale, elevation, radius.
  - Professional: Tight hierarchy, purposeful whitespace, no amateur layouts (no random full-h, no lost rails, consistent headers).
  - Responsive (from prior): Mobile-first stacking, 44px targets, safe-areas, fluid on large desktop.
  - Purposeful additions: Flywheel visible (ledger in studio, intelligence in training), one-click actions, states polished.
- **Contracts & Tests:** Fully tailored to new vision (enforce shell usage, new IA copy, studio integration, consistent structure, model language). No more "broken" assertions.

This will make authenticated feel "locked in" – one professional system. Sloppy -> polished. Chaotic -> cohesive. Lost rail -> always there.

**Current Broken State (Audit Summary from Exploration):**
- Routing: Flat but studio special-cased with full h-dvh div in AgentStudioHome -> bypasses WorkspaceShell -> no left rail. Other pages (Overview, Agents, Knowledge, Actions, Billing, Settings, ClientApps, Customization) use shell -> inconsistency.
- IA: Unclear hierarchy. Studio isolated. Training has internal rail but overall nav chaotic. Agent context not always clear. Legacy redirects add confusion.
- Page Structure: Studio full-bleed no shell/header. Others have varying headers, content padding, card usage. Roster in overview vs agents inconsistent. Workroom has good prior ledger but structure around it sloppy.
- Userflows: Create -> not clearly to train/run. Studio workroom has proposals/ledger but navigation out broken (no rail). No explicit model reinforcement across. "Too many errors" likely from contract violations on structure.
- Feel: Amateur because structure doesn't match the excellent design system and prior work (tokens, flywheel, responsive, clean visuals). Pages don't feel like they belong together.
- Contracts/Tests: Enforce old patterns (e.g., specific studio framing, no right rail) that conflict with current bypasses and don't support perfect IA. Tests expect old strings/routes.
- Other: Some pages have good elements (roster, composer), but overall no unified architecture.

**Target Screen Patterns (from world-class designer principles + Wireline needs):**
- Overview: TOOL-HOME (summary + quick actions + roster teaser).
- Agents: TOOL-LIST (searchable roster, create).
- Studio (workroom): CHAT-OPS integrated (chat + ledger below/integrated, agent context, no right rail).
- Studio (roster mode): TOOL-HOME or list.
- Training: TOOL-SETTINGS (header agent select + internal TrainingRail + main content + intelligence + upload).
- Actions/Wire: TOOL-DETAIL or list.
- Inbox: LIST or detail.
- Settings: TOOL-SETTINGS with subnav.

All inside shell for consistency. Use +DENSE for ops, consistent elevation.

**Detailed Redesign**

**1. Routing Architecture (Clean, Logical, Context-Preserving)**
- Default: /overview (authenticated home).
- Fleet: /agents
- Work: /studio (with ?agent=ID [required for deep], &mode=workroom|overview)
- Train: /training (with ?agent=ID, &section=facts|guidance|... )
- Tools: /actions , /inbox
- Configure: /settings , /settings/billing , /settings/team , /settings/customization , /settings/apps
- Legacy preserved via redirects (no breakage).
- Query for state (not path segments for simplicity).
- In code: useSearchParams for agent/mode/section. Pass down.
- Update AppRoutes.tsx to remove special studio full-height; ensure all wrapped or use shell.

**2. Page Structure (Consistent Shell + Patterns)**
- Root: All authenticated go through routes that use WorkspaceShell (or make Studio use it).
- Shell changes: Support 'studio' variant for minimal header or full content in main (e.g., contentClassName="h-full min-h-0" for workroom).
- Header: Always eyebrow + title. For agent pages: agent selector or current agent badge + switcher.
- Content: Standardized:
  - Grids with responsive (cols-1 sm:2 lg:3 xl:4 for lists; proper for details).
  - studio-card for surfaces.
  - Consistent gaps (gap-4 sm:gap-6), padding (px-4 sm:px-6 lg:px-8).
  - Typography: display/h1 for titles, overline for labels, body for content.
- Studio specific: Inside shell main -> StudioWorkspaceV2 (fits h-full). When workroom: chat takes space, ledger as integrated bottom section (or responsive side on large but no "right rail" violation – use below for clean).
- No full-viewport overrides except where shell controls.
- Mobile: Shell handles dock; content stacks.

**3. IA & Navigation**
- Persistent rail (from shell): Always visible. Update labels for clarity: "Overview", "Fleet", "Studio", "Training", "Wire", "Inbox", "Settings".
- Active states accurate (use pathname + query).
- Agent context: In studio/training/actions if applicable, header has selector or "For: AgentName".
- Breadcrumbs if deep, but keep flat – rail + header sufficient.
- Quick actions everywhere (e.g., "New agent" from multiple places -> create dialog).

**4. Userflow Redesign (Seamless, Model-Reinforcing)**
- **Create:** Short intake (dialog preferred for speed, or /studio?create=1). -> POST agent -> auto-nav to /training?agent=ID with initial brief/personality injected + "Intelligence from outcomes" pre-seeded if possible. Or option to /studio.
- **To Run (Studio):** From overview (quick brief composer -> /studio?agent=ID&mode=workroom&command=xxx). From fleet (select -> open studio). Agent list in studio overview mode.
- **During Run:** Chat in workroom. Live ledger of outcomes below or section (actionable: click outcome -> "Review & train" prefills draft or navigates to training with suggestion). Proposals from prior work elevated.
- **To Train:** From studio ( "Train from this" button or link with context). In training: See real intelligence from recent outcomes (pull from ledger). Apply suggestions one-click (updates config). Test call. "Back to Studio".
- **Context & Handoff:** Agent always in URL. Briefs/outcomes carry data. Clear model language in every header/copy: "Brief it. Train it. Run it." "Outcomes train the fleet."
- **Fleet Management:** /agents for overview/manage. Link to studio/training per agent.
- **Settings:** Global + per-agent where makes sense. Clear "Fleet" vs individual.
- Error handling: Consistent notices, no dead ends. Degraded states handled.
- Onboarding/First run: Create -> train -> run cycle obvious.

**5. Visual & Interaction Polish (Keep System, Master Execution)**
- Colors: Exact current Letterpress: #F7F6F3 canvas, whites/subtles, near-black text, #2B5548 action, muted grays, and status colors for meaning.
- Everything uses tokens, studio-card, consistent components (Button variants, etc.).
- States: Every interactive/list has loading (skeletons matching layout), empty (purposeful copy + CTA), error, success.
- Microcopy: Verbs, specific, model-reinforcing. Banned: vague or old language.
- Responsive: As previous pass (stack on mobile, breathe on large).
- Focus/ A11Y: Rings, labels, targets.
- No amateur: Tight, purposeful whitespace, one primary per view, consistent alignment.

**Tailoring Tests & Contracts to Vision**
- **check-wireline-clear-system.mjs**: Enforce new architecture.
  - Require WorkspaceShell in all main authenticated pages (Overview, Agents, Studio via new structure, Knowledge, Actions, Billing, Customization, etc.).
  - Studio must use shell (no h-[100dvh] bypass); must have rail.
  - Specific IA copy and patterns: "Fleet" for agents page, "Studio" framing with "Direct the work." + ledger/intelligence, "Training" explicit with rail and "Intelligence from outcomes", "Overview" for home.
  - No right rail in workroom (keep).
  - Update musts for new headers, agent selectors, integrated ledger.
  - Enforce consistent studio-card usage, no custom full-viewports.
- **authenticated-agent-flow-contract.test.ts**: Update asserts for new routes, strings (e.g., "Fleet", "Studio", shell usage, new headers, agent context in studio/training), flows (seamless handoffs, model language).
- **Other contracts/tests** (product-docs, etc.): Align copy and structure expectations.
- **New patterns in checks**: "persistent rail", "studio inside shell", "agent context in header", "integrated outcomes ledger in workroom".
- This makes contracts enforce the *perfect* system, not the old broken one.

**Phased Implementation (One Tier/Logical Chunk per PR, Testable)**
1. **Core Structure Fix (Studio + Shell Integration - T0 Critical):**
   - Edit AgentStudioHome.tsx: Wrap in WorkspaceShell (eyebrow="Studio", title=agent name, action=agent switcher if needed).
   - Edit StudioWorkspaceV2.tsx: Remove h-[100dvh] wrapper. Make it fit shell (h-full min-h-0 on internals). Handle isWorkroom vs overview inside content.
   - Edit WorkspaceShell.tsx: Add support for studio mode (minimal header or full contentClassName for chat). Ensure rail always renders.
   - Update AppRoutes if needed.
   - Update check for "studio uses shell".
   - Test: /studio shows rail + content. Workroom functional. Mobile ok.
   - Files: AgentStudioHome.tsx, StudioWorkspaceV2.tsx, WorkspaceShell.tsx, check script.

2. **IA & Routing Cleanup (T1):**
   - Update AppRoutes.tsx: Clean routes, consistent redirects. Ensure default /overview.
   - Update navigation in shell and pages for new labels (Fleet instead of scattered).
   - Standardize query param usage (agent, mode, section) in all agent pages.
   - Add/update agent context in headers (selector or badge).
   - Update check and tests for new routing/IA strings.
   - Files: AppRoutes.tsx, shell, relevant pages, contracts/tests.

3. **Page Structure Standardization (T2 - Consistency):**
   - Audit and update all authenticated pages to use consistent shell header/content patterns.
   - Enforce studio-card, grids, typography, states everywhere.
   - For Studio workroom: Integrate ledger (from prior) cleanly below chat or section.
   - For Training: Ensure internal rail + content fits shell.
   - Update Overview/Agents for consistent roster patterns.
   - Files: OverviewPage.tsx, AgentsPage.tsx, KnowledgePage.tsx, ActionsPage.tsx, Billing etc., Studio internals. contracts.

4. **Userflow Polish & Integration (T1/T2):**
   - Enhance flows: Add "from outcome" links, prefill, agent context preservation.
   - Integrate intelligence/ledger (prior work) into new structure.
   - Add model language reinforcement.
   - Polish microcopy, empty states, actions.
   - Files: StudioWorkroom, KnowledgeWorkspace, Overview, CreateDialog, contracts.

5. **Contracts & Tests Tailoring (T2):**
   - Full rewrite of relevant musts in check-wireline-clear-system.mjs to match vision (shell everywhere, new IA, studio integration, copy, patterns).
   - Update test expectations in authenticated-agent-flow-contract.test.ts and others.
   - Add new asserts for persistent rail, integrated flows.
   - Run and fix until green.
   - Update master spec/this plan.

6. **Polish & Validation (T1 + Final):**
   - Visual pass: Tokens, no debt, beautiful details.
   - Responsive (already strong).
   - Full checks, tests, manual audit (all pages feel one system).
   - Heuristic scorecard (no score 1).
   - Update any docs.

**Files to Touch (High Level):**
- Routing: src/routes/AppRoutes.tsx
- Shell: src/components/WorkspaceShell.tsx
- Studio: src/pages/AgentStudioHome.tsx, src/components/StudioWorkspaceV2.tsx, StudioOverview.tsx, StudioWorkroom.tsx
- Pages: OverviewPage.tsx, AgentsPage.tsx, KnowledgePage.tsx, ActionsPage.tsx, BillingSettings.tsx, Settings*, ClientAppsPage.tsx, CustomizationSettings.tsx
- Contracts: scripts/check-wireline-clear-system.mjs
- Tests: tests/authenticated-agent-flow-contract.test.ts , others
- Supporting: lib/product-copy.ts (for model language), contexts/AgentsContext if needed, constants if any.

**Validation & Success:**
- All pages use shell + persistent rail.
- Studio no longer loses rail; integrated.
- Navigation logical, flows seamless (test end-to-end Create-Train-Run-Review).
- Contracts/tests green and tailored.
- Professional, consistent, no chaos (use designer pre-ship checklist + heuristics).
- Colors: Exact current Letterpress.
- Feels "perfect system" – premium, locked-in.

This is the masterclass redesign. Structure first (shell/routing/IA), then polish flows and tailor contracts. Prior work (ledger, intelligence, responsive, Letterpress) slots in perfectly.

**Next:** Once approved, execute Phase 1 (Studio + Shell). I can start coding the changes now.

The full detailed plan is in the file (I expanded it with this full redesign). Let's make the authenticated experience world-class. 

Audit complete, vision brainstormed, plan ready. What do you want to tackle first in execution? Or approve and I begin implementing the shell/studio integration.

**Architecture:**
- Persistent DesktopRail (left nav) for all authenticated pages via WorkspaceShell. No page bypasses the rail.
- WorkspaceShell provides consistent structure: rail + main (header with eyebrow/title/action + content area).
- Studio is special but integrated: rendered inside shell's main area (remove full-h-[100dvh] bypass). Workroom takes full main flex for chat focus, with integrated ledger below or as section (no right rail per contract).
- Clear IA:
  - Overview (/overview): Fleet dashboard, quick actions, roster teaser.
  - Fleet (/agents): Full roster/list.
  - Studio (/studio): Active agent work surface (roster mode or workroom with ?agent=?&mode=workroom).
  - Training (/training): Deep config surface (with agent selector in header).
  - Wire/Actions (/actions): Integrations and tools.
  - Inbox (/inbox): Messages.
  - Settings (/settings + subs): Account, billing, team, customization.
- Routing: Flat + query params for context (agent, mode, section). Legacy redirects preserved. No hijacks.
- Consistent patterns: Use shell header everywhere possible. Standard content wrappers (studio-card, grids with responsive). Agent context in header for agent-specific pages.
- Contracts: Update clear-system check to enforce new consistent structure (persistent rail, integrated studio, no chaos).
- Visuals: Preserve/enhance Letterpress (tokens, studio-card, etc.). Professional polish on spacing, hierarchy, states.
- User flows: Seamless navigation, visible model (Create/Train/Run), no dead ends, clear agent context.

**Global Constraints:**
- Respect existing contracts where possible; update check script and tests as needed.
- Keep Wireline Letterpress system (no visual overhaul).
- Mobile/desktop responsive (from prior pass).
- Agent-owned: queries scoped to active agent.
- Server logic unchanged.
- Phased PRs for reviewability.
- All changes pass `node scripts/check-wireline-clear-system.mjs`, vitest contracts, build, verify.
- Target screen codes (from designer): TOOL-HOME for overview, CHAT-OPS for workroom (integrated), TOOL-SETTINGS for training, TOOL-LIST for agents, etc.

## Current Problems (from audit)
- Studio (/studio) renders full h-[100dvh] <StudioWorkspaceV2 /> bypassing WorkspaceShell → loses left side rail (DesktopRail).
- Inconsistent page structures: some use shell header/content, studio does not.
- Chaotic feel: varying card styles, padding, headers, nav active states, agent selectors.
- Routing: flat but studio special-cased; potential for lost context; legacy redirects.
- IA broken: unclear how overview/studio/training relate; side rail disappears in core work surface.
- Sloppy: missing states, poor hierarchy in some pages, amateur inconsistencies despite good Letterpress foundation and prior elevation work (flywheel, ledger).
- Errors: design contract likely complains about structure; user reports many issues.

## Target Perfect System
- **Persistent navigation**: Left rail always visible for authenticated (Home, Agents, Studio, Train, Wire, Inbox, Settings). No exceptions.
- **Studio integration**: Full rail + shell header (minimal for workroom: agent name + mode + back). Main content = StudioWorkspaceV2 content fitting flex (h-full min-h-0).
- **Consistent IA**:
  - Home/Overview: entry + quick studio + fleet teaser.
  - Agents: management.
  - Studio: primary execution (roster or focused workroom + outcomes ledger integrated cleanly).
  - Train: first-class config (side rail for sections inside shell).
  - Wire: tools.
- **Routing model**: /overview (default), /studio?agent=ID&mode=workroom (or overview), /training?agent=ID&section=xxx, etc. Context in URL.
- **Page template**: All via WorkspaceShell (eyebrow, title, optional agent select/action in header, content). Special minimal header for studio workroom.
- **Visual/functional polish**: Use studio-card consistently, proper tokens, all states (loading/empty/error/success), clear microcopy, purposeful elements (e.g. ledger always visible in studio context), no chaos.
- **Outcomes**: Studio workroom always has access to ledger/outcomes without losing nav. Flywheel visible (intelligence in train, outcomes in run).
- **Professional**: Tight spacing, hierarchy, no amateur layouts. Feels like one polished system.

## Implementation Plan (Phased, Testable)

### Phase 1: Foundation - Integrate Studio into Shell (T0/T1 - Critical Fix)
**Goal**: Never lose side rail. Studio always has persistent nav.

**Files:**
- Modify: `src/pages/AgentStudioHome.tsx` (wrap in shell or change render).
- Modify: `src/components/StudioWorkspaceV2.tsx` (remove full h-screen overrides; fit in parent flex).
- Modify: `src/components/WorkspaceShell.tsx` (add studio-specific handling if needed; ensure rail always; adjust main for studio contentClassName="h-full min-h-0").
- Update: contracts in check script for studio shell usage.
- Test: `src/components/StudioWorkspaceV2.tsx` behavior.

**Steps:**
- [ ] Update AgentStudioHome to render inside WorkspaceShell (use shell for header/rail, pass children as the V2 content with proper classes).
  ```tsx
  return (
    <WorkspaceShell
      eyebrow="Studio"
      title={active?.name || "Studio"}
      contentClassName="h-full min-h-0 overflow-hidden p-0"  // special for full content
      action={... agent selector if needed}
    >
      <StudioWorkspaceV2 />  // now fits inside
    </WorkspaceShell>
  );
  ```
- [ ] In StudioWorkspaceV2: remove `h-[100dvh] min-h-0 overflow-hidden` wrapper. Make internal divs use `h-full min-h-0` to fit parent.
  ```tsx
  // instead of <div className="h-[100dvh]..."><StudioWorkspaceV2 /></div>
  // just render <StudioWorkspaceV2 /> inside shell main
  ```
- [ ] Adjust StudioWorkroom and StudioOverview to assume shell context (use h-full where chat needs it, flex).
- [ ] Update shell to detect studio and render minimal header (agent name, mode switch, back) or integrate agent context.
- [ ] Run check script; update any musts (e.g., studio now uses shell).
- [ ] Test: /studio shows rail; workroom functional; no layout break.
- [ ] Commit: "fix(studio): integrate into WorkspaceShell to restore persistent side rail"

## Execution Status (2026-06-28)
- Core structure (Studio in Shell, persistent rail): ✅ Complete.
- Thin consistent agent bar in shell for Studio with name pill + "Direct the work. Wire it.": ✅
- Recipe rename (AgentForge -> AgentWireForm) + labels "Wire Agent", "Wire & Deploy": ✅
- "Wire one.", "Wire it.", "Brief it. Train it. Wire it." propagated + clever puns.
- Responsive: fluid max-w (shell 1480, workroom 3xl/xl-5xl/2xl-6xl), min-h-44, stacks, safe-area, active states everywhere.
- Contracts/tests: Clear System, authenticated flow (9/9) pass; no right rail, shell, ledger/intel, "Wire".
- Fixes: TS/lint cleaned (Link, hoist, any->LooseRecord).
- First merge to origin/main: ✅ (32771e71). Second pending masterful finish.
- All pages: shell unified, minimal clean functional, world-class device care.
- Ready for final merge when QA complete.

**Risk/Mitigation**: Height/scroll issues – use min-h-0 flex-1 everywhere. Test on mobile too (native dock).

### Phase 2: Standardize All Authenticated Pages (T1/T2 - Consistency)
**Goal**: Every page feels part of one professional system. No chaos.

**Files (examples):**
- Update: All shell-wrapped pages (KnowledgePage, ActionsPage, BillingSettings, Settings*, OverviewPage, AgentsPage, etc.) for consistent header usage, card styles (studio-card), spacing.
- Modify: `src/components/WorkspaceShell.tsx` (standardize header patterns, add agent context prop).
- New/Modify: Common header components or props for agent selector in studio/training.
- Update: `src/constants/navigation.ts` or shell nav for accurate active states.
- Contracts: update check for consistent patterns (e.g., header structure).

**Steps:**
- [ ] Inventory all pages and enforce:
  - Use WorkspaceShell with eyebrow/title.
  - Content uses studio-card, consistent grids (responsive as prior).
  - Agent selector in header for agent-specific pages (studio, training).
- [ ] Standardize microcopy and model language (Create. Train. Run. from contracts).
- [ ] Ensure no page-specific overrides that break cohesion (e.g., custom rails).
- [ ] For Studio inside shell: when isWorkroom, render full chat in main; add integrated ledger section (from prior work, keep below or as tab).
- [ ] Update OverviewPage, AgentsPage to have consistent roster patterns.
- [ ] Run clear-system check; fix violations.
- [ ] Test flows: nav between pages, agent context preserved via URL.
- [ ] Commit per sub: e.g., "standardize: apply consistent shell + cards to training/wire/billing"

**Target patterns** (use from prior designer work):
- Overview: TOOL-HOME
- Agents: TOOL-LIST
- Studio workroom: CHAT-OPS (integrated)
- Training: TOOL-SETTINGS with side rail
- Actions: TOOL-DETAIL

### Phase 3: IA and Routing Polish (T2/T3)
**Goal:** Logical, broken-structure fixed. Clear organization.

**Files:**
- Modify: `src/routes/AppRoutes.tsx` (clean redirects, perhaps group under /workspace if needed but keep flat for simplicity).
- Update: navigation in shell.
- Modify: pages to use query consistently (e.g., always ?agent= in studio/training).
- Add: Breadcrumbs or context indicators if complex.
- Update contracts for routing (e.g., training first-class).

**Steps:**
- [ ] Define and document IA in plan or docs:
  - Top: Overview (home) / Fleet (agents) / Work (studio + train + wire + inbox) / Configure (settings).
- [ ] Routing: 
  - /overview default.
  - /agents for fleet.
  - /studio?agent=ID (defaults to overview mode inside).
  - /studio?agent=ID&mode=workroom for direct chat.
  - /training?agent=ID&section=xxx .
  - Keep legacy redirects.
- [ ] Add agent context preservation (e.g., last agent in local or URL).
- [ ] Ensure no 404s or lost state on refresh.
- [ ] Update check script for routing musts.
- [ ] Test: direct links, nav, mobile.
- [ ] Commit: "refine(routing): clean authenticated IA and query-based context"

### Phase 4: Polish and Validation (T1 + Contracts)
**Goal:** No errors, professional feel, flawless.

**Files:**
- Update: `scripts/check-wireline-clear-system.mjs` (new musts for shell usage in studio, consistent headers, no bypasses).
- Update tests: authenticated-agent-flow-contract.test.ts for new structure.
- All pages: add missing states, improve copy/hierarchy per prior elevation.
- Studio: integrate prior ledger/intelligence improvements fully inside new shell.
- Visual: use tokens everywhere, fix any remaining (from greps).

**Steps:**
- [ ] Enforce in check: "Studio must render inside WorkspaceShell", "All pages use consistent header".
- [ ] Polish: microcopy (e.g., "Direct the work." in studio), states (loading in overview/roster), purposeful elements (flywheel links).
- [ ] Run full: node check, vitest, npm run verify:full.
- [ ] Fix any errors.
- [ ] Update master spec/plan.
- [ ] Heuristic review: no chaos, professional.
- [ ] Commit: "polish: enforce structure in contracts, add states/copy polish"

## Phased Rollout and Validation
- PR 1: Studio shell integration (biggest fix).
- PR 2: Page standardization + IA/routing.
- PR 3: Contracts + polish + tests.
- Per PR: run `node scripts/check-wireline-clear-system.mjs`, contract tests, manual flow test (desktop/mobile), before/after screenshots.
- Full verify before merge.
- Feature flag if risky (but structure change, so direct).

## Risks and Mitigations
- Height/scroll breakage in studio: extensive min-h-0 flex testing.
- Contract violations: update script proactively.
- User disruption: clear navigation, preserve query params.
- Scope creep: focus authenticated only; public fine.

## Success Criteria
- Persistent side rail on every authenticated page, including Studio workroom.
- Clear, logical IA and routing (easy to navigate Create/Train/Run).
- Consistent, professional, non-chaotic pages (same header/content patterns).
- All design contracts pass; no "sloppy" feel.
- Flawless flows, states, responsiveness.
- Matches "perfect system" while keeping liked Letterpress design system.
- User can say "this feels locked in and professional".

## References
- Current: AppRoutes, WorkspaceShell, Studio* files, check script, prior elevation spec (flywheel/ledger).
- Designer patterns: screen codes, shell, no right rail for workroom.
- Product model: Create → Train → Run.
- Letterpress tokens and components.

This plan delivers the perfect authenticated foundation. Implement phase by phase with validation. Once done, the product will feel cohesive, professional, and flawless in structure/organization. 

Next step after plan approval: start Phase 1 implementation.
