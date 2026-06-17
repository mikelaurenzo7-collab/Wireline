# Layout and Chrome UX Investigation Handoff Report

## 1. Observation
1. **Responsive Scrolling Configurations:**
   In `src/components/layout/AppShell.tsx`:
   - Line 322: `className="client-console flex flex-col min-h-dvh md:h-dvh md:max-h-dvh md:min-h-0 text-ink font-sans overflow-x-hidden overflow-y-auto md:overflow-hidden relative"`
   - Line 388: `className="client-console__main flex-1 min-h-0 overflow-x-hidden overflow-y-auto md:overflow-hidden overscroll-y-contain relative flex flex-col z-10 focus:outline-none lg:pl-[var(--wireline-rail-w,56px)] transition-[padding-left] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]"`
   - Line 408: `className="client-console__stage workspace-stage flex-1 overflow-x-hidden overflow-y-auto md:overflow-hidden relative z-10 min-h-0 px-0 md:px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:px-4 lg:pb-4"`

2. **Mobile Viewport Scroll Lock Design Guidelines:**
   In `DESIGN.md` (lines 172-175):
   - `html`, `body`, `#root` are pinned to `height: 100dvh; overflow: hidden`
   - `No document-level scroll — the browser chrome stays perfectly stationary`
   - `All scrollable areas use .scroll-viewport (overflow-y: auto; overscroll-behavior-y: contain)`

3. **ThemeToggle Missing on Desktop for Full-Bleed Pages:**
   - In `src/components/layout/AppShell.tsx` (lines 396-403):
     ```tsx
     {showPageContext && (
       <WorkspaceTopBar
         eyebrow={pageCtx.eyebrow}
         title={pageCtx.title}
         subtitle={pageCtx.subtitle}
         onShowShortcuts={() => setShowShortcuts(true)}
       />
     )}
     ```
   - In `src/lib/wireline-app-chrome.ts` (lines 12-14):
     ```tsx
     export function shouldShowAppPageContext(pathname: string): boolean {
       return !isFullBleedAppRoute(pathname);
     }
     ```
     (where `FULL_BLEED_APP_ROUTES` contains `"/chat"` and `"/agents"`).
   - In `src/components/layout/TopBar.tsx` (line 273):
     ```tsx
     className={cn("shrink-0 sticky top-0 z-50 border-b lg:hidden transition-all duration-300 wl-panel-elevated elev-1", ...)}
     ```
   - No `ThemeToggle` is imported or rendered in `src/components/layout/Sidebar.tsx`.

4. **Tablet Navigation Strip Unlabeled Icons:**
   In `src/components/layout/TopBar.tsx` (lines 233-243):
   ```tsx
   <span
     className={cn(
       "relative z-10 whitespace-nowrap transition-all duration-300 flex-1 min-w-0 truncate text-left",
       isDrawer ? "inline" : "hidden lg:inline",
       active ? "font-semibold" : "font-normal",
       activeTextClass,
     )}
   >
     {item.label}
   </span>
   ```
   For the top bar horizontal navigation strip on tablet (`md:flex lg:hidden`), `isDrawer` is false, meaning labels are hidden by `hidden lg:inline` classes.

5. **Bulky Interactive Hit Targets:**
   In `src/components/layout/TopBar.tsx`:
   - Line 403 (Avatar button): `className="... min-h-[44px] h-auto ... px-1.5 py-2.5 md:py-1 ..."` inside an `h-11` (44px) header (line 281).
   - Line 526 (Hamburger button): `className="... w-10 h-10 ..."`
   - Line 585 (Close button): `className="... w-11 h-11 ..."`
   In `DESIGN.md` (lines 158-160):
   - `Do not use bulky w-11 h-11 / w-12 h-12 classes to satisfy tap targets — this distorts the compact visual silhouette. Use hit-area-44 or the built-in ::after expansion on ShadButton instead.`
   - `Decouple visual size from hit targets. Keep visual elements compact (36px inputs, 32px secondary buttons, 20px utility icons). Expand interactive hit areas to 44–48px minimum...`

6. **Clipped Sidebar Active Nav Indicator:**
   In `src/components/layout/Sidebar.tsx` (lines 236-242):
   ```tsx
   {active && (
     <motion.span
       layoutId="rail-active-stripe"
       aria-hidden="true"
       className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand shadow-[0_0_10px] shadow-brand/50"
       transition={{ type: "spring", stiffness: 380, damping: 32 }}
     />
   )}
   ```

7. **Sidebar Aesthetics (Glass vs. Solid Purple):**
   In `src/components/layout/Sidebar.tsx` (line 62) and `src/styles/wireline-design-system.css` (lines 694-700):
   - The sidebar uses the class `wl-rail-shell` which is styled as a solid, dark purple gradient (`background: linear-gradient(180deg, var(--color-brand-deep, #3b154c) 0%, #2d1040 55%, #1f0c30 100%)`).
   - In `DESIGN.md` (line 46): `Permitted surfaces: modal overlays (.glass-elevated), sticky shells (.shell-sticky-glass), sidebar chrome, icon buttons on glass panels.`
   - In `DESIGN.md` (line 50): `Shell surfaces (TopBar, Sidebar, modals, popovers, sticky headers) are permanently exempt — those keep .glass/.glass-strong/.glass-elevated/.shell-sticky-glass.`

---

## 2. Logic Chain
1. **Responsive Scrolling:**
   - *Observation:* On mobile viewports (`<md`), the `.client-console`, `.client-console__main`, and `.client-console__stage` components all carry `overflow-y-auto` classes (since the `md:overflow-hidden` overrides do not apply). In addition, `client-console` is defined with `min-h-dvh` instead of a locked `h-dvh`.
   - *Reasoning:* A mobile browser loading this page will render three nested, scrollable containers.
   - *Conclusion:* This violates the strict locked-viewport contract (`DESIGN.md` §3b), resulting in rubber-banding, scroll chaining, multiple scrollbar lines, and address bar jank on mobile web.

2. **ThemeToggle Missing on Desktop for Full-Bleed Pages:**
   - *Observation:* On full-bleed routes (`/chat`, `/agents`), `showPageContext` is `false`, which hides the `WorkspaceTopBar` (and its nested `ThemeToggle`). On desktop viewports (`>=lg`), the `TopBar` (and its nested `ThemeToggle`) is hidden via `lg:hidden`. The desktop `Sidebar` does not contain a `ThemeToggle`.
   - *Reasoning:* There is no other element on the screen rendering a `ThemeToggle` for desktop users on these routes.
   - *Conclusion:* Desktop users visiting the Assistant (`/chat`) or Agent Studio (`/agents`) have no visual control to toggle the theme.

3. **Tablet Unlabeled Icon Clutter:**
   - *Observation:* On tablet viewports (`md` to `lg-1`), `TopBar` displays a horizontal navigation strip of active groups. The text labels for these items carry `hidden lg:inline`, meaning they are hidden on tablet. No `Tooltip` wrapper is present on the links.
   - *Reasoning:* The items render as a row of raw icons. Without text labels or hover tooltips (which do not work on touch screens), users have no discoverable way to identify the navigation routes.
   - *Conclusion:* This results in "mystery meat" navigation and high cognitive load for tablet users.

4. **Bulky Interactive Hit Targets:**
   - *Observation:* The avatar dropdown trigger is styled with `min-h-[44px] px-1.5 py-2.5` directly on its container. The close and hamburger buttons use explicit `w-11 h-11` and `w-10 h-10` classes.
   - *Reasoning:* These classes visually expand the visual container to satisfy tap target guidelines.
   - *Conclusion:* This violates the core design contract to keep visual controls compact and decouple them from interactive hit areas via `::after` expansion. The avatar button is particularly problematic since it spans the full `44px` height of the `TopBar` header, resulting in a cramped visual layout with no margins.

5. **Clipped Sidebar Active Nav Indicator:**
   - *Observation:* The active indicator stripe inside the sidebar nav items is positioned at `absolute -left-2`. The sidebar is fixed to `left-0`.
   - *Reasoning:* Shifting the stripe 8px to the left of the item box places it at a negative coordinate relative to the screen.
   - *Conclusion:* The indicator stripe is clipped off-screen by the viewport edge, rendering it invisible or broken.

6. **Sidebar Aesthetics (Glass vs. Solid Purple):**
   - *Observation:* The sidebar is styled with a solid, dark purple gradient, while `DESIGN.md` mandates that shell surfaces (including Sidebar) keep `.glass`/`.shell-sticky-glass` treatments.
   - *Conclusion:* There is a visual inconsistency between the design system specification and the solid dark purple command rail implementation.

---

## 3. Caveats
- No code modification was made in this branch as per the read-only constraints.
- We assume that the dark purple styling of `Sidebar.tsx` is an intentional branding choice to anchor the app workspace (representing the "Silky Purple" aspect of the system), but flagged it as a technical mismatch with the written guidelines in `DESIGN.md`.

---

## 4. Conclusion & Redesign Proposal
To achieve a premium, highly responsive layout that honors the **Rich Cream + Silky Purple** design system, the following modifications are proposed:

### A. Viewport Lock & Scrolling Architecture (AppShell.tsx)
- Lock the viewport heights of all outer containers to `h-dvh max-h-dvh overflow-hidden` across all sizes (eliminating `min-h-dvh` and `overflow-y-auto` on mobile for shell containers).
- Apply the `.scroll-viewport` class exclusively to `client-console__stage` to isolate all scrolling, avoiding rubber-banding and scrollbar clutter.
```tsx
// Proposed AppShell.tsx Outer Container
<div
  data-testid="client-console"
  className="client-console flex flex-col h-dvh max-h-dvh text-ink font-sans overflow-hidden relative"
>
...
// Proposed AppShell.tsx Main Column
<main
  ref={mainRef}
  id="main-content"
  tabIndex={-1}
  className="client-console__main flex-1 min-h-0 overflow-hidden relative flex flex-col z-10 focus:outline-none lg:pl-[var(--wireline-rail-w,56px)]"
>
...
// Proposed AppShell.tsx Stage
<div
  ref={stageRef}
  className="client-console__stage workspace-stage flex-1 scroll-viewport relative z-10 min-h-0 px-0 md:px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:px-4 lg:pb-4"
>
```

### B. Theme Toggle on Desktop Full-Bleed Pages (Sidebar.tsx / WorkspaceTopBar.tsx)
- Introduce a compact theme toggle button into the desktop `Sidebar.tsx` footer (underneath the settings/founder icon buttons) so that desktop users on full-bleed views (`/chat`, `/agents`) can access the control:
```tsx
// Proposed Sidebar.tsx Footer Addition
<Tooltip>
  <TooltipTrigger asChild>
    <div className="h-8 flex items-center justify-center">
      <ThemeToggle variant="default" compact className="rounded-md h-7 w-7 text-white/60 hover:text-white hover:bg-white/[0.08]" />
    </div>
  </TooltipTrigger>
  <TooltipContent side="right" className="ml-1">
    Toggle theme
  </TooltipContent>
</Tooltip>
```

### C. Tablet Navigation Usability (TopBar.tsx)
- Tablet navigation should hide the horizontal navigation strip entirely and delegate all routes to the drawer (`drawerOpen`) to match mobile layout behavior.
- Alternatively, render labels next to the icons inside the horizontal top-bar nav strip (hiding less crucial items inside a "More" dropdown if necessary) and wrap each item inside a modern touch-friendly `Tooltip`.

### D. Decouple Tap Targets from Sizing (TopBar.tsx)
- Redesign the TopBar buttons (user menu dropdown trigger, close drawer, hamburger) to be visually compact (e.g. `h-8 w-8` or `h-9 w-9` with `size="icon"`).
- Utilize the `hit-area-44` utility class (or let `ShadButton`'s built-in `after:` expansion handle it) to expand interactive hit areas invisibly without bloated heights.
```tsx
// Proposed User Menu Dropdown Trigger
<ShadButton
  type="button"
  variant="chrome"
  size="sm"
  disableAnimations
  onClick={() => setUserMenuOpen((v) => !v)}
  className="touch-press flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-1.5 h-8 hover:scale-[1.02] hit-area-44"
>
```

### E. Fix Active Indicator Stripe (Sidebar.tsx)
- Correct the active stripe offset inside the sidebar links to sit within visible parameters (e.g. `left-0` or `left-1` instead of `-left-2`) to avoid screen edge clipping.
```tsx
{active && (
  <motion.span
    layoutId="rail-active-stripe"
    aria-hidden="true"
    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand shadow-[0_0_10px] shadow-brand/50"
    transition={{ type: "spring", stiffness: 380, damping: 32 }}
  />
)}
```

---

## 5. Verification Method
- **Code Inspection:**
  - Verify layout class names in `src/components/layout/AppShell.tsx` lines 322, 388, and 408.
  - Verify position styles in `src/components/layout/Sidebar.tsx` (line 236).
  - Verify tablet text labels classes in `src/components/layout/TopBar.tsx` (line 236).
- **Automated Tests:**
  - Run the design-system test suites to verify style ratchets are maintained:
    ```bash
    npm run test:design
    ```
    *(specifically runs wireline-design-audit, shadcn-pivot-ratchet, and wireline-director-design).*
