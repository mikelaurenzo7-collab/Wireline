---
name: ui-ux-design-qa-cheatcode
description: World-class Visual QA Auditor and Warrior UI/UX Designer combined. Focuses on premium aesthetics, spacing grids, tactile interactive feedback, responsive layout verification, and flawless code safety.
---

# UI/UX & Visual QA Design Cheat-Code Skill 👁️🛡️✨

Use this skill when auditing, designing, and polishing Wireline UI pages, interactive components, layouts, and CSS files. It combines high-end visual design with rigorous QA verification.

---

## 1. The Core Design System & CSS Tokens

Align all custom code with the established design tokens in [index.css](file:///c:/Users/MichaelLaurenzo/Downloads/Wireline-2/src/index.css):

### Tactility & Paper foundations

- **Root Background**: The page body background is always `--color-paper` (`#efe9dc` / `#f5f0e6`).
- **Tactile Depth**: Apply `.paper-texture` to primary cards and drawers to add rich organic depth.

### Depth & Elevation Levels

Use explicit elevation utilities instead of ad-hoc shadow variables:

- `.elev-0` — Flat, structural boundary (box-shadow: `var(--shadow-0)`).
- `.elev-1` — Low elevation, cards and lists (box-shadow: `var(--shadow-1)`).
- `.elev-2` — Medium elevation, dropdown triggers and overlays (box-shadow: `var(--shadow-2)`).
- `.elev-3` — High elevation, primary floating controls (box-shadow: `var(--shadow-3)`).
- `.elev-glow` — Specular halo effect (box-shadow: `var(--shadow-glow)`).

### Glassmorphism Surfaces

- **`.glass-1`**: Backdrop-blur 12px, saturate 140%. Use on navigation bars, header chrome, and small popovers.
- **`.glass-2`**: Backdrop-blur 18px, saturate 160%. Use on modals, overlays, and large dashboard dialogs.

### Zero-Latency Touch Feedback

- **`.touch-press`**: Instant physical response on click/tap, scales down to `scale(0.97)`. Apply to standard buttons and inputs.
- **`.touch-press-deep`**: Deeper response scaling down to `scale(0.95)`. Use on primary CTA buttons and larger clickable cards.

### Dynamic Accent Theming

Wireline drives theme coloring using `--wl-accent`. Set `data-accent` on a parent container and colorize children using semantic accent classes:

- `.wl-accent-surface` — Translucent background and border blended with the accent color.
- `.wl-accent-text` — Text colorized with the accent color.
- `.wl-accent-glow` — Solid background using the accent color.
- `.wl-accent-bubble` — Subtle border and background tint for badges.
- `.wl-accent-dot` — Solid dot with accent-colored box-shadow.
- `.wl-accent-icon-box` — Accent backdrops with custom 4px layout shadows.

---

## 2. Spacing, Grid & Alignment Integrity

### The Spacing Grid

- Ensure all margins, paddings, and gaps align to a clean spacing scale (multiples of 4px / 8px). Do not introduce arbitrary numbers (like `p-[13px]` or `gap-3.5`).

### Baseline Alignment

- Elements (text, icons, buttons) within lines must align precisely. Use flex alignment (`items-center`, `items-baseline`) and avoid hardcoded offsets (e.g. `mt-[1px]`) which break across viewports or fonts.

### Defensive Spacing & Wrapping

- Use `truncate`, `line-clamp`, or proper min-widths to prevent text strings from wrapping awkwardly or overlapping with buttons/icons.

---

## 3. Interactive State Checklist

Every interactive control must support 5 clear states:

1. **Idle**: Clean typography, semantic colors, clear purpose.
2. **Hover**: Smooth tactile translation or lift (e.g. `hover:-translate-y-0.5` or `hover:scale-[1.02]`) accompanied by shadow/border color transitions.
3. **Press**: GPU-accelerated Zero-latency press scale-downs using `.touch-press` or `.touch-press-deep`.
4. **Focus**: Rounded ring outlines using `:focus-visible` to support keyboard navigation (`focus-ring` / `focus-ring-dark`).
5. **Disabled**: Reduced opacity (`opacity-50`), disabled cursor (`cursor-not-allowed`), and inert click event handlers.

---

## 4. Breakpoint & Responsive Integrity

Verify all layouts across 3 major breakpoints:

- **Mobile (390px / iPhone)**: Check that text sizes scale down (`text-[clamp(...)]`), padding is compact (typically `p-4` maximum), and columns collapse cleanly into rows. Ensure **zero** horizontal scroll overflow.
- **Tablet (768px - 834px)**: Check for flex wrapping or grid template column wrapping so content doesn't get squished.
- **Desktop (1440px / 1920px)**: Check that text columns have set max-widths (typically max-w-xl to max-w-3xl) to keep reading lines comfortable.

---

## 5. Color, Contrast & Blend Safety

- **Readability Contrast**: Text must maintain a minimum contrast ratio of 4.5:1. Muted text must remain readable.
- **Gradient Blends**: Ensure gradients blend smoothly. Do not let gradient ranges fade to raw transparent grey — fade towards transparent values of the same hue or use HSL color-mix.
- **Backdrop Masking**: Ensure overlay text is readable over moving backgrounds by applying translucent mask layers (`bg-paper/85` or `.glass-1`).

---

## 6. Flawless Code Quality & Type Safety

- **No Placeholders**: Never allow TypeScript compilation (`tsc`) or ESLint warnings. Explicitly type all properties.
- **Type Narrowing**: If TS fails to narrow union types on API payloads, perform explicit typecasts instead of falling back to `any`.
- **Zero Waste**: Clean up unused imports, variables, and handler arguments before committing.
- **Hook Dependencies**: Maintain correct dependency arrays inside all `useCallback`, `useMemo`, and `useEffect` hooks to prevent rendering cycle memory leaks.

---

## 7. The E2E Verification Loop

1. **Build Local Verification**: Run the local development server (when available) or staging deployment to test styling.
2. **Commit and Push**: Stage, commit, and push modifications directly to `origin/main` using `--no-verify` (when local Node environment is restricted).
3. **Deploy & Auth Pause**: **CRITICAL INVARIANT:** Stop and wait. Do NOT start the visual QA or launch the browser subagent yet. Inform the user and wait for their confirmation that the Vercel production build has successfully completed and they have logged in their Founder's account in the browser.
4. **Visual Inspection**: Once the user approves, use browser automation or screenshot tools (e.g., `browser_subagent`) on `https://trywireline.com/` to audit layouts, typography, focus states, and transitions.
5. **Visual Regression Tests**: When local styling adjustments are made and local Node is present, run Playwright to update baseline files:
   `npx playwright test tests/e2e --update-snapshots`
