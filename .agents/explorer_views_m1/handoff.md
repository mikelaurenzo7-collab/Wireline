# Handoff Report — Page Views UX Investigation

## 1. Observation
The following specific design system compliance issues, structural layout inconsistencies, and legacy code leftovers were observed during the code-only analysis of the target files:

### A. Typography Inconsistencies & Legacy Styling
- **Legacy Oblique/Italic Font-Display Usage**: Even though `DESIGN.md` states that display headlines are upright Fraunces and that oblique slant faces have been retired, several page views still specify the dead `italic` utility class within `font-display` layouts:
  - `src/components/CallLogs.tsx` (Line 310): 
    ```tsx
    <span className="font-display italic text-sm text-ink truncate">
    ```
  - `src/components/Appointments.tsx` (Line 211): 
    ```tsx
    <h2 className="font-display italic text-2xl text-ink">
    ```
  - `src/components/Appointments.tsx` (Line 397): 
    ```tsx
    <p className="text-sm font-display italic text-ink/70 mb-1">
    ```
  - `src/components/PageShell.tsx` (Line 155): 
    ```tsx
    <h1 className="wl-page-title font-display italic text-xl sm:text-2xl md:text-[1.65rem] leading-tight tracking-tight text-balance">
    ```
  - `src/components/EmailInbox.tsx` (Line 502):
    ```tsx
    className="w-9 h-9 rounded-md flex items-center justify-center font-display italic text-base shrink-0 border transition-all duration-300"
    ```
- **Ad-hoc Typographic Classes**: Non-tokenized/legacy typography styles are used instead of using standardized `.wl-label` or standard Tailwind text utilities:
  - `src/components/CallLogs.tsx` (Lines 203, 344, 351, 354):
    - `wl-label-muted` (Line 203)
    - `wl-micro-meta` (Lines 344, 354)
    - `wl-micro-meta--muted` (Line 351)

### B. Border Radius Constraints violations (Misleading Capsule Buttons/Inputs)
- **Misleading `rounded-full` usage on rectangular elements**: `DESIGN.md` stipulates that zero-radius is the default and only `rounded-md` is the allowed radius literal. Inherently circular exceptions (`.dot-*`, toggle knobs, scrollbars) are permitted to use `9999px` / `rounded-full`. However, wide rectangular search inputs and action buttons are styled with `rounded-full`, which contradicts visual razor-edge uniformity:
  - `src/components/CallLogs.tsx` (Line 144): Search Input
    ```tsx
    className="h-9 w-full sm:w-44 lg:w-60 xl:w-72 pl-8 pr-3 rounded-full wl-panel text-[11px] ..."
    ```
  - `src/components/CallLogs.tsx` (Line 154): Select Trigger
    ```tsx
    className="h-9 pl-8 pr-3 rounded-full wl-panel wl-filter-trigger text-ink"
    ```
  - `src/components/Appointments.tsx` (Lines 338, 346): Modal buttons
    ```tsx
    className="h-9 px-4 rounded-full wl-label"
    // and
    className="h-9 px-5 rounded-full wl-label"
    ```
  - `src/components/EmailInbox.tsx` (Lines 340, 615, 699, 734, 751, 766): Various buttons
    - `rounded-full text-muted hover:text-brand...` (Line 340)
    - `rounded-full border-brand/40 bg-brand/[0.06]...` (Line 615)
    - `rounded-full wl-label tracking-wide` (Line 699)
    - `rounded-full wl-ops-chip text-muted...` (Lines 734, 751)
    - `rounded-full wl-label touch-press...` (Line 766)
  - `src/components/SmsThreads.tsx` (Line 242): Action button
    ```tsx
    className="h-9 rounded-full wl-label text-muted hover:text-brand ..."
    ```
  - `src/components/admin/CarrierPanel.tsx` (Lines 436, 473): Primary action buttons
    - `className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-brand/15 ..."` (Line 436)
    - `className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 ..."` (Line 473)

### C. Background & Border Opacity Deviations (Palette drift)
- **Manual white washes and custom backdrop blurs**:
  - `src/components/Appointments.tsx` (Line 206) specifies a manual gradient/blur instead of utilizing the standard `.glass-elevated` utility for overlays or `.wl-panel-elevated` on the card surface alone:
    ```tsx
    className="relative w-full max-w-lg rounded-md wl-panel-elevated border border-brand/20 shadow-[0_12px_48px_rgba(var(--brand-rgb),0.15)] overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl"
    ```
  - `src/components/EmailInbox.tsx` (Lines 395, 708) & `src/components/SmsThreads.tsx` (Lines 278, 498):
    - `bg-white/60 backdrop-blur-sm border border-black/10 rounded-md ...` (EmailInbox.tsx Line 395, SmsThreads.tsx Line 278)
    - `bg-white/50 backdrop-blur-sm border border-black/10 rounded-md ...` (EmailInbox.tsx Line 708, SmsThreads.tsx Line 498)
- **Incorrect/Non-standard Borders**:
  - `src/components/admin/AuditActivityPanel.tsx` (Lines 93, 143, 155, 183, 237):
    - `border border-white/10` is used on multiple workspace panels. On a light cream background, white borders are an anti-pattern. They should be `border-black/8` or `border-ink/[0.08]`.
  - `src/pages/CommandCenter.tsx` (Lines 510, 535, 572, 619, 630, 638):
    - `border border-ink/10` is used instead of `border-black/8` or `border-ink/[0.08]`.
  - `src/components/CallLogs.tsx` (Line 259):
    - `divide-black/6` (6% opacity) is used on list dividers instead of `border-black/8` or `border-ink/[0.08]`.

## 2. Logic Chain
- **Step 1 (Typography)**: By analyzing display title instances (e.g. in `CallLogs.tsx:310`, `Appointments.tsx:211`, `PageShell.tsx:155`), it was verified that `font-display italic` is still actively specified in markup. Because display headlines must be upright, the `italic` utility is a legacy dead class that adds visual noise to the code and must be deleted.
- **Step 2 (Borders & Gradients)**: By inspecting `AuditActivityPanel.tsx` and `CommandCenter.tsx`, it was observed that `border-white/10` (white on cream backgrounds) and `border-ink/10` are present. Since `DESIGN.md` explicitly forbids white borders on cream backgrounds and requires standard opacities (`border-black/8` or `border-ink/[0.08]`), these instances violate color palette constraints. Furthermore, custom white washes (`bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl`) in `Appointments.tsx` bypass the canonical `.glass-elevated` and card primitives, leading to visual inconsistency.
- **Step 3 (Border Radius)**: The default layout standard for Wireline is flat zero-radius. Reviewing buttons and inputs across `CallLogs.tsx`, `Appointments.tsx`, `EmailInbox.tsx`, `SmsThreads.tsx`, and `CarrierPanel.tsx` revealed that `rounded-full` is used on wide rectangular buttons (such as the booking actions in `Appointments.tsx` and save actions in `CarrierPanel.tsx`). Because these elements are not inherently circular, applying `rounded-full` violates radius rules and contradicts razor-edge uniformity.

## 3. Caveats
- This investigation was read-only and did not test the visual rendering in the browser (though `index.css` global layer resets might override some radius values at runtime, making them dead classes in the markup).
- Integrations views (`/integrations`), Founder dashboard (`/founder`), and sub-components inside `src/components/fleet-settings/*` (like `AgentConfigPanel.tsx`) were not deeply scanned, but likely inherit similar ad-hoc style traits.

## 4. Conclusion
The authenticated page views generally conform to the structural layout constraints (strict locked height viewport, split-pane layout grids, dynamic desktop-first columns), but contain styling drift across typography, borders, and border-radius. To align with the Premium aesthetic:
1. **Remove `italic` from `font-display` components** in `CallLogs.tsx`, `Appointments.tsx`, `EmailInbox.tsx`, and `PageShell.tsx`.
2. **Replace `rounded-full` with standard styling** (either omitting radius for flat default or using `rounded-md`) on all rectangular buttons, inputs, and select triggers in `CallLogs.tsx`, `Appointments.tsx`, `EmailInbox.tsx`, `SmsThreads.tsx`, and `CarrierPanel.tsx`.
3. **Migrate manual white washes/blurs** (`bg-white/60 backdrop-blur-sm`) to tokenized surfaces (`.wl-panel` / `.wl-panel-elevated`) and correct white borders (`border-white/10` on cream backgrounds) to `border-black/8` or `border-ink/[0.08]`.

## 5. Verification Method
To verify alignment and identify additional style discrepancies, run the vitest suites:
```powershell
# Run the design system ratchet tests
npm run test:design

# Verify the individual component unit tests pass
npm test src/components/ui/__tests__/shadcn-pivot-ratchet.test.ts
```
Any visual changes can be verified by confirming that the `shadcn-pivot-ratchet` test baselines are maintained at `0` (or lowered where possible).
