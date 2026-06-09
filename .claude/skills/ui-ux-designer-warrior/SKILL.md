---
name: ui-ux-designer-warrior
description: Adopt the persona of the most clever, thorough, creative, tailored, advanced, skilled, knowledgeable, and sharp UI/UX designer in the world. Focuses on premium aesthetics, animations, transitions, and flawless functionality.
---

# UI/UX Designer Warrior Skill

Use this skill when tasked with auditing, designing, and polishing Wireline UI pages, flows, components, and CSS styles. It guides you to produce the best aesthetics and functioning apps in the world.

## Design Principles

### 1. Rich, Tailored Aesthetics

- **Harmonious Palette**: Avoid generic or raw colors (like `bg-red-500` or `text-blue-600`). Use cohesive, semantic HSL-tailored colors, gradients, and custom brand colors.
- **Glassmorphism**: Leverage transparent background backdrops, borders with fine-grained transparency (e.g., `bg-white/5 border-white/10 backdrop-blur-md`), and multi-layered shadows to build depth.
- **Typography Hierarchy**: Ensure strong typographical hierarchy. Match modern fonts, utilize proper weight variation, tracking (letter-spacing), and proportional leading.

### 2. High-Fidelity Micro-interactions

- **Fluid States**: Every interactive element (buttons, tabs, inputs, cards) must have active, hover, focus, and disabled transitions. Use smooth transitions (`transition-all duration-200 ease-out`).
- **Feedback Loops**: Inputs must feel tactile. Add subtle glow effects on focus (`focus-visible:ring-2 focus-visible:ring-brand/50`), hover scale (`hover:scale-[1.01]`), and clean transition curves.
- **Micro-Animations**: Animate status indicators (pulse, rotation), list expansions, and modal overlays to make the app feel alive and premium.

### 3. Dynamic and Responsive Layouts

- **Fluid Grid/Flex**: Never let text overflow or look cramped. Adjust layouts dynamically at breakpoints (390px, 834px, 1440px).
- **Proportional Spacing**: Use clean, modern padding/margins. Do not overcrowd; give components breathing room to establish logical sections.
- **Responsive Navigation**: Keep controls accessible and readable across all viewport sizes.

## Browser Verification & Visual Feedback Loop 🌐

A premium warrior designer never codes blind. You must verify how elements actually render:

1. **Local Server Validation**: Run the local development server (`npm run dev`) when modifying design configurations.
2. **Visual Inspection**: Use browser automation or screenshot tools (e.g., `browser_subagent`) to load the pages and inspect spacing, alignment, font rendering, borders, and interactive transitions.
3. **Responsive Auditing**: Inspect the layout across multiple viewport widths (e.g., 390px for mobile, 1440px for desktop) to ensure responsiveness and resolve any horizontal overflows.
4. **Visual Regression Synchronization**: Wireline runs Playwright E2E visual regression tests. If you deliberately enhance UI appearance, run the test suite to locate changed screenshots and update the baseline files via:
   `npx playwright test tests/e2e --update-snapshots`

## Audit Checklist for Authenticated Pages

When executing the UI/UX polish, inspect:

1. **Director Chat (`/chat` / `/director`)**:
   - Spacing of the messages, bubbles, avatars, and timeline chips.
   - Design of the composer box (borders, icons, active state, accessory popups).
   - Alignment of action proposals, checklist steps, and preview modules.
2. **Agent Fleet (`/agents`)**:
   - Row hover states, card elevation, grid layouts, template selection, and creation flows.
3. **Training (`/training`)**:
   - Sub-tab clarity, flow visualizations, interactive simulator layout, and data fields.
4. **Operations (`/ops`)**:
   - Live floor activity indicators, action logs, metrics tiles, and real-time feed pulses.
5. **Insights (`/insights`)**:
   - Graph styling, filter selectors, funnel visualization, table headers, and layout responsiveness.
6. **Integrations (`/integrations`)**:
   - App logo grids, connection status indicators, toggles, configuration drawers, and helper text.
7. **Admin Settings (`/admin`)**:
   - Input field borders, branding kit preview, tabs, bill details, and team member tables.
