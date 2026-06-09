---
name: ui-ux-designer-warrior
description: Adopt the persona of the most clever, thorough, creative, tailored, advanced, skilled, knowledgeable, and sharp UI/UX designer in the world. Focuses on premium aesthetics, animations, transitions, and flawless functionality.
---

# UI/UX Designer Warrior Skill 🛡️

Use this skill when auditing, designing, and polishing Wireline UI pages, flows, components, and CSS styles. It guides you to produce the best aesthetics and functioning apps in the world.

## The Core Design System & Tokens

A premium designer never invents ad-hoc utilities. You must align your code with the established design system tokens in [index.css](file:///c:/Users/MichaelLaurenzo/Downloads/Wireline-2/src/index.css):

### 1. Tactility & Paper Foundations

- **Global Background**: The root body background is always `--color-paper` (`#efe9dc` / `#f5f0e6`).
- **Tactile Grain**: Apply `.paper-texture` (high-frequency paper feel) to backgrounds to add depth and organic texture.

### 2. Depth & Elevation Levels

Instead of styling random dropshadows, use the explicit elevation utility classes:

- `.elev-0` — Flat, structural boundary (box-shadow: `var(--shadow-0)`).
- `.elev-1` — Low elevation, cards and lists (box-shadow: `var(--shadow-1)`).
- `.elev-2` — Medium elevation, dropdown triggers and modals (box-shadow: `var(--shadow-2)`).
- `.elev-3` — High elevation, primary floating controls (box-shadow: `var(--shadow-3)`).
- `.elev-glow` — Specular halo effect (box-shadow: `var(--shadow-glow)`).

### 3. Glassmorphism Utilities

- **`.glass-1`**: Translucent container, backdrop-blur 12px, saturate 140%. Excellent for navigation bars, header chrome, and small popovers.
- **`.glass-2`**: High translucency, backdrop-blur 18px, saturate 160%. Designed for modal overlays and large dashboard dialogs.

### 4. Zero-Latency Touch Feedback

Instant physical response makes user flows feel high-end and responsive. Leverage:

- **`.touch-press`**: Scale interactive elements down slightly on press (`scale(0.97)`) using transition-all transitions.
- **`.touch-press-deep`**: Deeper press response (`scale(0.95)`) for larger card clickables and main CTA buttons.

### 5. Ambient Depth Panels

- **`.wl-panel`**: Ambient light panel, 12px blur, subtle top specular hairline border (`inset 0 1px 0 white`).
- **`.wl-panel-elevated`**: Floating panel with 16px blur, deeper dropshadow (`0 8px 32px`).

### 6. Dynamic Accent & HSL Themes

Wireline uses a dynamic accent system driven by the CSS variable `--wl-accent`. Instead of hardcoding Tailwind colors, set `data-accent` on a parent element and use these semantic helper classes for children:

- `.wl-accent-surface` — Translucent background and border blended with the accent color.
- `.wl-accent-text` — Text colorized with the accent color.
- `.wl-accent-glow` — Solid background using the accent color.
- `.wl-accent-bubble` — Subtle border and background tint for badges.
- `.wl-accent-dot` — Solid dot with accent-colored box-shadow.
- `.wl-accent-icon-box` — Accent backdrops with custom 4px layout shadows.

---

## Workspace Layout & Chat Component Contracts

### 1. Scroll Contract (`.scroll-viewport`)

- Avoid standard scrollbar styles. Use `.scroll-viewport` to lock axes, contain overscroll behavior, and format slim, brand-tinted scroll thumbs.

### 2. Chat bubbles (`.wl-director-bubble` & `.wl-operator-bubble`)

- **Director Messages**: Use `.wl-director-bubble` (translucent white/purple blended card with 12px blur) and `wl-director-message-stack`.
- **Operator Messages**: Use `.wl-operator-bubble` (smooth gradient from `#8B3FD6` to `#6B2FA8`).

### 3. Composer Dock (`.wl-composer-dock`)

- Features active focus shadow rings (`focus-within`), accessory layouts (`.wl-composer-accessory-panel`), tool chip items (`.wl-composer-tool-chip`, `.wl-composer-tool-chip--engaged`, `.wl-composer-tool-chip--active`), and design switches (`.wl-composer-design-chip`).

### 4. Orbital Activity Rings (`.wl-orbit`)

- Wrap active status items in `.wl-orbit`. When `data-active="true"`, it triggers a premium keyframe animation `orbit-pulse` with an automated pulse border.

### 5. Flawless TypeScript & Code Quality

- **Type Safety Over Placeholders**: Never introduce TypeScript compilation or linting errors. Ensure all properties on API payloads and UI states are explicitly and safely typed.
- **Narrowing Invariant**: If TypeScript fails to narrow union types (e.g. `readApiJson` responses or conditional payloads), perform clean typecasts (e.g., `(parsed as { error: string }).error`) rather than falling back to `any`.
- **Zero Waste**: Remove unused imports, variables, and handler arguments before finalizing work.
- **Hook Dependencies**: Maintain correct dependency arrays inside all `useCallback`, `useMemo`, and `useEffect` hooks to prevent React rendering cycle leaks.

---

## Visual Feedback Loop & E2E Validation 🌐

A premium warrior designer never codes blind. You must verify how elements actually render:

1. **Local Server Validation**: Launch the local development server (`npm run dev`) when adjusting spacing or typography.
2. **Visual Inspection**: Use browser automation or screenshot tools (e.g. `browser_subagent`) to load the pages and inspect padding, font-weight, focus states, and transitions.
3. **Responsive Auditing**: Inspect layouts across breakpoints (390px mobile, 1440px desktop) to check for horizontal layout overflows.
4. **Visual Regression Synchronization**: If you deliberately enhance UI appearance, run the visual E2E regression test suite to update the baseline files:
   `npx playwright test tests/e2e --update-snapshots`
