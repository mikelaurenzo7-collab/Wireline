---
name: Wireline Precision
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#434656'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#737688'
  outline-variant: '#c3c5d9'
  surface-tint: '#004ced'
  primary: '#003ec7'
  on-primary: '#ffffff'
  primary-container: '#0052ff'
  on-primary-container: '#dfe3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#793f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#9c5300'
  on-tertiary-container: '#ffdfc8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001452'
  on-primary-fixed-variant: '#0038b6'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is anchored in a philosophy of **Transparent Intelligence**. It moves away from the ephemeral "magic" of AI toward a tangible, high-fidelity toolset for professionals. The aesthetic is a fusion of **Modern Corporate** and **Minimalism**, prioritizing clarity and executive-level finish.

The system targets high-stakes communication where reliability is paramount. The visual language conveys stability through structured layouts, balanced typography, and a "calm tech" approach. Every element is designed to reduce cognitive load, using progressive disclosure to manage complexity without sacrificing power.

- **Human-Centric:** Interfaces feel approachable and explainable, never clinical or robotic.
- **High-Fidelity:** Focus on micro-details like 1px borders, subtle transitions, and precise alignment.
- **Trustworthy:** A grounded color palette and stable grid system reinforce the platform's reliability as a business-critical tool.

## Colors

This design system utilizes a foundation of deep charcoals and slate to establish authority. The palette is strictly functional:

- **Signal Blue (Primary):** Used for primary actions, focus states, and key navigational indicators. It represents movement and connectivity.
- **Calm Teal (Success):** Reserved for positive status updates, successful AI completions, and "ready" states.
- **Amber (Attention):** A soft, non-alarming yellow-orange for items requiring review or "needs input" states.
- **Neutrals:** A range of Slate grays provides the structure. `Slate-900` is used for primary text to maintain high contrast without the harshness of pure black.

**Workspace Distinction:**
- **Personal Mode:** Uses a transparent sidebar with a subtle `Slate-50` background.
- **Business Mode:** Features a very subtle `Signal Blue` tint (2% opacity) in the sidebar or a 2px vertical accent bar on the active workspace icon to provide immediate context without fragmenting the UI.

## Typography

The system uses **Inter** for its exceptional readability and neutral, professional character. The type scale is strictly hierarchical to ensure information density remains manageable.

- **Weight Usage:** Use `Semibold (600)` for headlines to create a strong visual anchor. `Medium (500)` is preferred for buttons and interactive labels.
- **Letter Spacing:** Headlines utilize slight negative tracking (-1% to -2%) to feel more cohesive at larger scales.
- **Labels:** Small labels use uppercase with increased tracking (+5%) to maintain legibility in metadata-heavy views.

## Layout & Spacing

The layout is built on a **12-column fluid grid** with a maximum container width of 1280px for desktop applications. It prioritizes generous whitespace to prevent the "dashboard fatigue" common in AI platforms.

- **Rhythm:** A 4px baseline grid ensures consistent vertical rhythm.
- **Density:** The system defaults to "Comfortable" spacing. For data-rich views (like communication logs), a "Compact" variant is used, reducing internal padding by 25%.
- **Breakpoints:**
    - **Mobile (<640px):** Single column, 16px margins.
    - **Tablet (641px - 1024px):** 8-column grid, sidebars collapse into a drawer.
    - **Desktop (>1025px):** 12-column grid, permanent left-hand navigation.

## Elevation & Depth

This design system uses a "Layered Flat" approach. Instead of heavy shadows, it relies on **Tonal Layers** and **Subtle Outlines** to define hierarchy.

- **Level 0 (Canvas):** `Slate-50` background.
- **Level 1 (Cards/Surface):** Pure white background with a 1px border of `Slate-200`.
- **Level 2 (Interactive/Floating):** Pure white with a 1px border and a soft, diffused shadow: `0px 4px 12px rgba(15, 23, 42, 0.05)`.
- **Level 3 (Modals/Overlays):** Pure white with a 1px border and a deep, focused shadow: `0px 12px 32px rgba(15, 23, 42, 0.1)`.

Depth is also communicated through backdrop blurs (8px) on navigation bars and sticky headers to maintain context of the content scrolling beneath.

## Shapes

The shape language is controlled and precise. 
- **Standard Elements:** Buttons, inputs, and small cards use an 8px (`0.5rem`) corner radius.
- **Large Containers:** Main content areas and large cards use a 16px (`1rem`) corner radius to soften the overall interface.
- **Feedback Elements:** Toast notifications and status badges use pill-shaped (fully rounded) corners to distinguish them from structural UI elements.

## Components

### Buttons
- **Primary:** `Signal Blue` background, white text. No gradient. 8px radius.
- **Secondary:** White background, 1px `Slate-200` border, `Slate-900` text.
- **Ghost:** No background or border. `Slate-600` text, shifts to `Slate-900` on hover.

### Input Fields
- **Default:** White background, 1px `Slate-200` border.
- **Focus:** 1px `Signal Blue` border with a 3px soft blue outer glow (box-shadow).
- **Label:** `Slate-600` Small/Bold, positioned above the field.

### Status Chips
- **Active:** `Calm Teal` background (10% opacity) with `Calm Teal` text.
- **Paused:** `Slate-100` background with `Slate-600` text.
- **Testing/Draft:** `Signal Blue` background (10% opacity) with `Signal Blue` text.

### Cards
Cards are the primary container for AI insights. They feature a 1px `Slate-200` border and no shadow unless they are interactive (hover state triggers Level 2 elevation).

### Progressive Disclosure
Complex AI settings are hidden behind "Advanced Parameters" accordions. Only the "Executive Summary" and primary action are visible by default to keep the interface clean for daily use.