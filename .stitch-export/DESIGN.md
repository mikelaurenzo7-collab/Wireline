---
name: Ametrine Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#484554'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#797586'
  outline-variant: '#c9c4d7'
  surface-tint: '#6042d6'
  primary: '#451ebb'
  on-primary: '#ffffff'
  primary-container: '#5d3fd3'
  on-primary-container: '#d8ceff'
  inverse-primary: '#cabeff'
  secondary: '#5d5e65'
  on-secondary: '#ffffff'
  secondary-container: '#dfdfe7'
  on-secondary-container: '#616269'
  tertiary: '#444443'
  on-tertiary: '#ffffff'
  tertiary-container: '#5c5b5b'
  on-tertiary-container: '#d6d3d3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e6deff'
  primary-fixed-dim: '#cabeff'
  on-primary-fixed: '#1c0062'
  on-primary-fixed-variant: '#4723be'
  secondary-fixed: '#e2e2e9'
  secondary-fixed-dim: '#c6c6cd'
  on-secondary-fixed: '#1a1b21'
  on-secondary-fixed-variant: '#45464d'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1c1b1b'
  on-tertiary-fixed-variant: '#474646'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1280px
---

## Brand & Style
The design system is built for high-stakes professional environments where precision and clarity are paramount. The brand personality is authoritative yet modern, favoring a "Wireline" aesthetic—characterized by thin, precise strokes, generous whitespace, and a structured layout that suggests engineering-grade reliability.

The design style is **Corporate / Modern** with a focus on **Minimalism**. It utilizes a sophisticated purple palette to evoke a sense of premium capability and intelligence, moving away from standard utility blues toward a more distinctive, "expert-tier" identity. The interface remains quiet to let data speak, using the primary brand color sparingly but impactfully for active states and critical calls to action.

## Colors
The palette is anchored by a deep, technical purple (`#5D3FD3`) that signifies premium quality and sophisticated logic. This primary color is used for active navigation states, primary buttons, and critical data highlights.

- **Primary:** Deep Purple (`#5D3FD3`). High-contrast for accessibility, used for intent.
- **Secondary:** Lavender Tint (`#F8F7FF`). Used for subtle backgrounds and container fills to soften the workspace without losing professional rigor.
- **Neutral:** A range of slate grays (`#0F172A` to `#F1F5F9`) ensures the interface feels grounded. Text is kept at high-contrast ratios (7:1 or higher for body text) to maintain "Wireline" legibility.
- **Active States:** Interactive elements use a 10% opacity overlay of the primary color on hover, and a solid fill for selected states.

## Typography
Typography in this design system emphasizes hierarchy and technical precision. **Hanken Grotesk** provides a sharp, contemporary feel for headlines, while **Inter** ensures maximum readability for dense data sets and long-form body copy.

For technical metadata, labels, and code-like identifiers, **JetBrains Mono** is utilized in an uppercase label format. This monospaced touch reinforces the "Wireline" narrative of precision and structured information. Line heights are kept generous to prevent visual clutter in data-heavy views.

## Layout & Spacing
The design system employs a **Fixed Grid** model for desktop, centered within the viewport to maintain a professional, editorial feel. 

- **Grid:** 12-column system with 24px gutters.
- **Rhythm:** An 8px linear scale (using a 4px base unit) governs all padding and margins to ensure mathematical consistency.
- **Desktop:** 48px outer margins with a maximum container width of 1280px.
- **Mobile:** Fluid transition to a 4-column grid with 16px margins and 16px gutters.
- **Density:** High-density layouts are preferred for dashboards, using tight internal padding (8px or 12px) within cards to maximize information "at-a-glance."

## Elevation & Depth
Depth is expressed through **Low-contrast outlines** rather than heavy shadows, preserving the clean "Wireline" aesthetic.

- **Surface Tiers:** Backgrounds use `#FFFFFF`, while secondary containers and sidebars use the light lavender tint (`#F8F7FF`) to create separation.
- **Borders:** 1px solid borders in a soft gray (`#E2E8F0`) define containers. 
- **Active Elevation:** When an element requires focus (like a modal), a very soft, diffused ambient shadow (`0px 10px 25px -5px rgba(93, 63, 211, 0.05)`) is used, tinted slightly with the primary purple to maintain brand cohesion.

## Shapes
To maintain a professional and technical tone, this design system uses **Soft** roundedness. 

- **Base Radius:** 0.25rem (4px) for small components like checkboxes and input fields.
- **Component Radius:** 0.5rem (8px) for cards and buttons, providing a modern touch without appearing overly "bubbly" or consumer-grade.
- **Large Radius:** 0.75rem (12px) for major sections or modals.
This geometric discipline suggests order and structural integrity.

## Components
- **Buttons:** Primary buttons use the solid Primary Purple with white text. Secondary buttons use a 1px border of the Primary Purple with a transparent background.
- **Input Fields:** Use a 1px border (`#CBD5E1`). On focus, the border transitions to Primary Purple with a subtle 2px outer glow (ring) of the same color at 20% opacity.
- **Cards:** Flat design with a 1px border. Header areas within cards should have a subtle horizontal separator to distinguish metadata from content.
- **Chips/Tags:** Used for categorization. These should use the secondary Lavender fill with dark purple text for a sophisticated, low-profile look.
- **Lists:** Data rows should use alternating subtle fills or 1px dividers. Hover states for list items should use the Primary color at 5% opacity to signal interactivity without obscuring data.
- **Status Indicators:** Use the Primary Purple for "Neutral/Processing" or "System" states, while maintaining standard green/red for success/error, ensuring the purple remains the dominant brand "anchor."