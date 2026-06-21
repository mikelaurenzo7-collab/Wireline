---
name: Precision Operator
projectId: '15464421841872665077'
source: user-provided Google Stitch Design MD
---

# Precision Operator — canonical Wireline web specification

This is the authoritative source record for the Wireline web application. It supersedes prior Figma, export-bridge, guard-sheet, and compatibility design systems.

## Source precedence for duplicate semantic values

The Design MD contains both Material-style semantic tokens and application-level aliases. For visible Wireline web surfaces, use the explicit application guidance below:

- **Page / shell background:** `#F7F7F5` (`background-page` and written Brand & Style guidance)
- **Base surface semantic:** `#F9F9F7` (`surface` / `background`)
- **Cards, active inputs, popovers:** `#FFFFFF` (`surface-container-lowest` / `background-surface`)
- **Secondary surfaces / input wells:** `#F4F4F2` (`surface-container-low`)
- **Container layers:** `#EEEEEC`, `#E8E8E6`, `#E2E3E1`
- **Primary body text:** `#1D1D1F` (`text-primary`)
- **Strong semantic on-surface:** `#1A1C1B`
- **Secondary metadata:** `#6E6E73` (`text-secondary`)
- **Functional on-surface variant:** `#414846`
- **Card/list border:** `#E5E5E2` (`border-subtle`)
- **Outline / disabled:** `#717976`; stronger outline variant: `#C1C8C4`
- **Primary action:** `#1A3C34` (written component guidance)
- **Deep primary / hover:** `#01261F`
- **Primary fixed / status tint:** `#C5EADF`; fixed dim: `#AACEC3`
- **Connected/live:** `#285A43`; error: `#BA1A1A`

## Full source color table

| Token | Value |
| --- | --- |
| surface | #F9F9F7 |
| surface-dim | #DADAD8 |
| surface-bright | #F9F9F7 |
| surface-container-lowest | #FFFFFF |
| surface-container-low | #F4F4F2 |
| surface-container | #EEEEEC |
| surface-container-high | #E8E8E6 |
| surface-container-highest | #E2E3E1 |
| on-surface | #1A1C1B |
| on-surface-variant | #414846 |
| inverse-surface | #2F3130 |
| inverse-on-surface | #F1F1EF |
| outline | #717976 |
| outline-variant | #C1C8C4 |
| surface-tint | #43655C |
| primary | #01261F |
| on-primary | #FFFFFF |
| primary-container | #1A3C34 |
| on-primary-container | #83A69C |
| inverse-primary | #AACEC3 |
| secondary | #5E5E63 |
| secondary-container | #E0DFE4 |
| tertiary | #361812 |
| tertiary-container | #4F2D26 |
| error | #BA1A1A |
| error-container | #FFDAD6 |
| primary-fixed | #C5EADF |
| primary-fixed-dim | #AACEC3 |
| background-page | #F7F7F5 |
| background-surface | #FFFFFF |
| text-primary | #1D1D1F |
| text-secondary | #6E6E73 |
| status-green | #285A43 |
| border-subtle | #E5E5E2 |

## Typography

- Inter: all primary UI.
- JetBrains Mono: timestamps, status codes, compact counts, and operator labels only.
- `headline-lg`: 32/40, 600, -0.02em.
- `headline-md`: 24/32, 600, -0.01em.
- `headline-sm`: 18/24, 600.
- `body-lg`: 16/24, 400.
- `body-md`: 14/20, 400.
- `label-caps`: 11/16, 600, +0.05em.
- `label-mono`: 12/16, 500, +0.02em.
- Mobile headline-lg: 24/32, 600.
- Do not use synthetic 650 weights. Do not force font smoothing.

## Geometry and layout

- Base rhythm: 8px stacks, with all precise micro-adjustments aligned to a 4px baseline.
- Control radius: 4px. Card radius: 8px. Modal radius: 12px. Pills only for non-interactive status metadata.
- Desktop sidebar: 212px, fixed/persistent.
- Max application container: 1680px.
- Main content gutter: 24px in the inner grid; page margin: 40px where the screen composition requires it.
- Mobile: sidebar becomes a hidden drawer; page margins compress to 16px.
- Navigation hover: ghost surface. Active: a 2px green left rail and a restrained tonal fill.
- Cards: 1px `#E5E5E2` outline; 0 1px 2px rgba(26,60,52,.05) resting shadow; hover 0 4px 12px rgba(26,60,52,.08) with at most a 1.005 scale.
- Inputs: 40px minimum height; 1px border; focus becomes primary green plus a subtle 2px 10% glow.

## Product posture

Wireline is a single, calm, operator-grade system for both personal and business assistants. Personal and business use change copy, workflows, templates, approvals, and knowledge—not the visual language. Avoid gradients, glass, overly round consumer-social surfaces, and decorative chrome.
