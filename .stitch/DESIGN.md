---
name: Ametrine Precision
projectId: '15464421841872665077'
projectUrl: 'https://stitch.withgoogle.com/projects/15464421841872665077'
colors:
  surface: '#F8F9FF'
  surface-dim: '#CBDBF5'
  surface-container-lowest: '#FFFFFF'
  surface-container-low: '#EFF4FF'
  surface-container: '#E5EEFF'
  surface-container-high: '#DCE9FF'
  surface-container-highest: '#D3E4FE'
  on-surface: '#0B1C30'
  on-surface-variant: '#484554'
  outline: '#797586'
  outline-variant: '#C9C4D7'
  primary: '#5D3FD3'
  primary-variant: '#4B32B3'
  primary-container: '#E0E7FF'
  success: '#2E7D32'
  error: '#BA1A1A'
typography:
  headline-lg: { fontFamily: Hanken Grotesk, fontSize: 32px, fontWeight: '600', lineHeight: 40px, letterSpacing: -0.02em }
  headline-md: { fontFamily: Hanken Grotesk, fontSize: 24px, fontWeight: '600', lineHeight: 32px, letterSpacing: -0.01em }
  headline-sm: { fontFamily: Hanken Grotesk, fontSize: 18px, fontWeight: '600', lineHeight: 24px }
  body-lg: { fontFamily: Inter, fontSize: 16px, fontWeight: '400', lineHeight: 24px }
  body-md: { fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: 20px }
  label-mono: { fontFamily: JetBrains Mono, fontSize: 12px, fontWeight: '500', lineHeight: 16px, letterSpacing: 0.05em }
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  lg: 0.5rem
  xl: 0.75rem
spacing:
  sidebar-width: 256px
  app-bar-height: 64px
  card-padding: 12px
  page-gutter: 16px
  desktop-content-max: 1280px
---

# Ametrine Precision

Wireline is a precise AI communications workspace for personal and business assistants. The same system supports assistant creation, live operations, knowledge, connections, inbox, and account context; the workflow adapts to the user rather than switching to a competing visual language.

Use blue-white layered surfaces, deep navy reading text, thin precision borders, and Ametrine purple for actions, active state, and focused intelligence. Avoid forest/cream, Signal Blue, mesh backgrounds, generic glass dashboards, noisy gradients, and broad “operator” language.

## Layout

Use a fixed **256px** desktop workspace sidebar and a **64px** global app bar. Preserve a full-width application shell with a compact content rhythm and a desktop content maximum of 1280px where a route benefits from reading focus. The workspace rail owns workspace identity, New Agent, navigation, and support. The app bar owns Wireline identity, notifications, help, workspace switching, and profile utilities.

## Components

Controls use 4px corners. Major cards use 8px corners. Modals use 12px corners. Card padding is normally 12px. Pills are restricted to status, readiness, and compact filters. Cards use white surfaces, 1px `#C9C4D7` outlines, and restrained neutral/purple elevation. Inputs are 40px high and focus with a 2px Ametrine ring.

## Route map

| Route | Source states |
| --- | --- |
| `/overview` | workspace overview, handoffs, outcomes, active assistants |
| `/agents` | assistant roster, empty, loading, degraded |
| `/studio` | configuration and Test & Simulation |
| `/knowledge` | source freshness, workspace knowledge, agent knowledge |
| `/actions` | scoped connections and integrations |
| `/inbox` | conversations, handoffs, recaps |
| `/settings` | business profile, operational context, escalation |

The companion source screens cover access, landing, pricing, mobile, iOS, Android, widgets, and CarPlay. Keep personal and business modes inside one Ametrine system; change workflow depth and copy, not the design contract.
