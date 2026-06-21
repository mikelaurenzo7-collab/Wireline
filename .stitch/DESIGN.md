---
name: Precision Operator
projectId: '15464421841872665077'
projectUrl: 'https://stitch.withgoogle.com/projects/15464421841872665077'
colors:
  surface: '#F9F9F7'
  surface-dim: '#DADAD8'
  surface-container-lowest: '#FFFFFF'
  surface-container-low: '#F4F4F2'
  surface-container: '#EEEEEC'
  surface-container-high: '#E8E8E6'
  surface-container-highest: '#E2E3E1'
  on-surface: '#1A1C1B'
  on-surface-variant: '#414846'
  outline: '#717976'
  outline-variant: '#C1C8C4'
  primary: '#01261F'
  primary-container: '#1A3C34'
  primary-fixed: '#C5EADF'
  primary-fixed-dim: '#AACEC3'
  background-page: '#F7F7F5'
  background-surface: '#FFFFFF'
  text-primary: '#1D1D1F'
  text-secondary: '#6E6E73'
  status-green: '#285A43'
  border-subtle: '#E5E5E2'
typography:
  headline-lg: { fontFamily: Inter, fontSize: 32px, fontWeight: '600', lineHeight: 40px, letterSpacing: -0.02em }
  headline-md: { fontFamily: Inter, fontSize: 24px, fontWeight: '600', lineHeight: 32px, letterSpacing: -0.01em }
  headline-sm: { fontFamily: Inter, fontSize: 18px, fontWeight: '600', lineHeight: 24px }
  body-lg: { fontFamily: Inter, fontSize: 16px, fontWeight: '400', lineHeight: 24px }
  body-md: { fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: 20px }
  label-mono: { fontFamily: JetBrains Mono, fontSize: 12px, fontWeight: '500', lineHeight: 16px, letterSpacing: 0.02em }
  label-caps: { fontFamily: Inter, fontSize: 11px, fontWeight: '600', lineHeight: 16px, letterSpacing: 0.05em }
  headline-lg-mobile: { fontFamily: Inter, fontSize: 24px, fontWeight: '600', lineHeight: 32px }
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
spacing:
  sidebar-width: 212px
  max-container: 1680px
  gutter: 24px
  margin-page: 40px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

# Precision Operator

Wireline is software as a tool: calm, high-density, operator-grade, and built for long sessions. Personal and business assistants share one visual system; only workflows, templates, permissions, and wording change.

Use a warm paper page, white cards, near-black reading text, subtle outlines, and forest actions. Use Inter for all UI and JetBrains Mono only for technical data, timestamps, status, and compact operator labels. Avoid gradients, glass, broad repair styles, synthetic font weights, and forced smoothing.

## Layout

Use a fixed 212px desktop sidebar and a fluid main stage capped at 1680px. Use a 24px internal grid gutter, 40px desktop page margin, stacks of 8/16/32px, and a 16px mobile page margin. The mobile sidebar becomes a drawer or compact navigation surface.

## Components

Controls use 4px corners. Cards and modals use 8px corners. Pills are status metadata only. Cards use white surfaces and a 1px `#E5E5E2` outline. Popovers may use only `0 4px 12px rgba(0,0,0,0.05)` depth. Inputs are 40px high and focus with forest border plus a 2px 10% green ring.

## Route map

| Route | Source states |
| --- | --- |
| `/studio` | training and creation |
| `/agents` | roster, empty, loading, degraded |
| `/knowledge` | facts, rules, empty |
| `/actions` | permissions and connections |
| `/ops` | live, handoffs, quality |
| `/settings` | workspace administration |

The companion source screens cover landing, personal-agent marketing, pricing, solutions, mobile, and sign-in. Lead with assistants for life and work while retaining a clear business path.
