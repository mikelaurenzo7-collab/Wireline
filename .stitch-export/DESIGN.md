---
name: Wireline Operating System
colors:
  surface: '#f9f9f7'
  surface-dim: '#dadad8'
  surface-bright: '#f9f9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f2'
  surface-container: '#eeeeec'
  surface-container-high: '#e8e8e6'
  surface-container-highest: '#e2e3e1'
  on-surface: '#1a1c1b'
  on-surface-variant: '#414846'
  inverse-surface: '#2f3130'
  inverse-on-surface: '#f1f1ef'
  outline: '#717976'
  outline-variant: '#c1c8c4'
  surface-tint: '#43655c'
  primary: '#01261f'
  on-primary: '#ffffff'
  primary-container: '#1a3c34'
  on-primary-container: '#83a69c'
  inverse-primary: '#aacec3'
  secondary: '#5e5e64'
  on-secondary: '#ffffff'
  secondary-container: '#e3e1e9'
  on-secondary-container: '#64646a'
  tertiary: '#361812'
  on-tertiary: '#ffffff'
  tertiary-container: '#4f2d26'
  on-tertiary-container: '#c4948a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c5eadf'
  primary-fixed-dim: '#aacec3'
  on-primary-fixed: '#00201a'
  on-primary-fixed-variant: '#2b4d44'
  secondary-fixed: '#e3e1e9'
  secondary-fixed-dim: '#c7c5cd'
  on-secondary-fixed: '#1b1b20'
  on-secondary-fixed-variant: '#46464c'
  tertiary-fixed: '#ffdad3'
  tertiary-fixed-dim: '#efbab0'
  on-tertiary-fixed: '#30130d'
  on-tertiary-fixed-variant: '#623d36'
  background: '#f9f9f7'
  on-background: '#1a1c1b'
  surface-variant: '#e2e3e1'
  surface-cream: '#F7F7F5'
  surface-white: '#FFFFFF'
  ink-charcoal: '#1D1D1F'
  ink-slate: '#6E6E73'
  accent-forest: '#1A3C34'
  status-active: '#2D5A27'
  status-warning: '#B45309'
  border-subtle: '#E5E5E1'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
  mono-ui:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar_width: 212px
  container_margin: 24px
  gutter: 16px
  stack_sm: 4px
  stack_md: 8px
  stack_lg: 16px
---

## Brand & Style

This design system is built for "operator-grade" utility. It prioritizes high-density information architecture, functional clarity, and a calm, focused environment for small business owners managing AI fleets. The aesthetic is inspired by mid-century telecommunications equipment and modern high-productivity software like Linear, emphasizing "tools over toys."

The design style is **Minimalist & Professional**, leaning into a structured, grid-based layout that avoids decorative flourishes. It utilizes a warm, light surface palette to reduce eye strain during long operational sessions, creating a "physical" feel reminiscent of quality office stationery or hardware consoles. The atmosphere should evoke reliability, precision, and 24/7 readiness.

## Colors

The palette moves away from "SaaS Purple" in favor of a grounded, "heritage technology" feel. 

- **Primary:** A deep, sophisticated Forest Green (`#1A3C34`) serves as the primary action color. It signals growth and reliability without the clinical feel of standard blue.
- **Surface:** The foundation is `surface-cream` (`#F7F7F5`), providing a warmer, more sophisticated backdrop than pure white. Pure white is reserved for high-elevation cards and input fields.
- **Ink:** Text utilizes `ink-charcoal` for high-contrast headlines and `ink-slate` for secondary information, ensuring a clear hierarchy of data.
- **Accents:** Borders use a warm-neutral grey to maintain the soft, paper-like quality of the interface.

## Typography

The system uses **Inter** for its neutral, highly legible character at small sizes, crucial for high-density dashboards. 

A critical element of the "Operator" look is the use of `label-caps`. These are micro-labels used as "eyebrows" above sections or for secondary metadata. They should always be rendered in uppercase with increased letter spacing to ensure legibility despite the small font size.

For technical data points, such as AI confidence scores or call durations, use a monospaced font (JetBrains Mono) to emphasize the precision of the software.

## Layout & Spacing

The layout is a **Fixed-Fluid hybrid** designed for a three-column "Studio" experience:
1.  **Navigation:** A fixed 212px left sidebar containing the fleet directory and core modules.
2.  **Main Stage:** A fluid central area for the primary work surface (e.g., call logs, script editor).
3.  **Inspector:** A collapsible right sidebar (320px) for detailed metadata and agent settings.

Spacing follows an 8px rhythmic grid, but allows for 4px increments in high-density components like tables and list items. Margins are kept tight (24px) to maximize the "dashboard" feel and ensure all critical controls remain "above the fold" on standard laptop displays.

## Elevation & Depth

To maintain a "minimal decoration" ethos, this design system eschews heavy shadows in favor of **Tonal Layering** and **Low-Contrast Outlines**.

- **Level 0 (Background):** `surface-cream` (#F7F7F5).
- **Level 1 (Cards/Sidebar):** `surface-white` (#FFFFFF) with a 1px border of `#E5E5E1`.
- **Level 2 (Modals/Popovers):** `surface-white` with a very soft, diffused ambient shadow (0px 4px 12px, 5% opacity charcoal) to distinguish it from the card layer.

Buttons and active states use "inset" tonal shifts rather than elevation to mimic physical membrane switches.

## Shapes

The shape language is **Soft (0.25rem)**. 

Large radii are avoided to maintain a professional, "industrial" aesthetic. Standard UI elements (buttons, inputs, cards) use a 4px corner radius. Status pills and avatars are the only exceptions, using a fully "pill-shaped" radius to provide visual contrast against the otherwise rectangular, grid-locked interface.

## Components

- **Buttons:** Primary buttons use `accent-forest` with white text. Secondary buttons use a white background with a subtle border. Padding is tight (8px 12px) to support high-density layouts.
- **Status Pills:** Small, high-contrast badges for "Live," "Training," or "Offline." Use `status-active` for positive states.
- **Input Fields:** Flat, white backgrounds with a 1px border. On focus, the border shifts to `accent-forest` with no outer glow.
- **Cards:** Used to group fleet agents. They feature a 1px border, no shadow, and use `label-caps` for the category header.
- **Skeleton States:** Use a subtle pulse animation on `surface-cream` blocks to represent AI "thinking" or data fetching without breaking the calm UI.
- **Sidebar Items:** Clear, text-heavy links with `16px` icons. Active states are indicated by a subtle vertical bar on the left edge in `accent-forest`.
- **Studio Columns:** Vertical dividers should be simple 1px lines (`#E5E5E1`) without gaps to create a unified "console" feel.