# Extractable Wireline Components

This is the reusable component menu for Superdesign. Visual content, icon choices, labels, and CSS remain hardcoded unless a state or navigation value genuinely changes by route.

## Layout Components

### PrecisionPublicHeader
- Source: `src/components/marketing/PrecisionPublicHeader.tsx`
- Category: layout
- Description: Responsive Wireline public header with wordmark, navigation, mobile menu, and acquisition actions.
- Extractable props: none today; candidate `activePath` only if embedded outside React Router.
- Hardcoded: WirelineMark, navigation labels and URLs, Menu/X/ArrowRight icons, all CSS classes.

### MarketingFooter
- Source: `src/components/marketing/MarketingFooter.tsx`
- Category: layout
- Description: Multi-column public footer with product, company, trust, legal, and support links.
- Extractable props: none.
- Hardcoded: link groups, Wireline identity, copyright language, icons, all CSS.

### MarketingPageFrame
- Source: `src/components/layout/MarketingPageFrame.tsx`
- Category: layout
- Description: Complete public route frame with header, main landmark, sticky CTA, footer, and cookie consent.
- Extractable props: `hideStickyCta`, `mainClassName`, `children`.
- Hardcoded: header/footer composition, skip-link target, global public chrome.

### MarketingChrome
- Source: `src/components/marketing/MarketingChrome.tsx`
- Category: layout
- Description: Lightweight public shell for pages that manage their own content frame.
- Extractable props: `mainClassName`, `children`.
- Hardcoded: PrecisionPublicHeader and MarketingFooter.

### WorkspaceShell
- Source: `src/components/WorkspaceShell.tsx`
- Category: layout
- Description: Authenticated desktop/mobile application chrome, navigation rail, account controls, and content viewport.
- Extractable props: `fullBleed`, `contentClassName`, `children`.
- Hardcoded: route registry, Wireline identity, navigation icons and labels, responsive rail behavior.

### WorkspacePageFrame
- Source: `src/components/layout/WorkspacePageFrame.tsx`
- Category: layout
- Description: Rhythmic authenticated page composition for eyebrow, title, summary, actions, tabs, body, and aside regions.
- Extractable props: `eyebrow`, `title`, `summary`, `actions`, `tabs`, `children`, `aside`, density and width flags.
- Hardcoded: semantic regions, spacing system, responsive behavior, all CSS.

### StudioPageShell
- Source: `src/components/studio/StudioPageShell.tsx`
- Category: layout
- Description: Studio-specific shell that keeps agent creation and editing inside the shared workspace language.
- Extractable props: active studio state and route-aware children.
- Hardcoded: studio navigation vocabulary, icons, layout classes.

### AdminHubViewport
- Source: `src/components/layout/AdminHubViewport.tsx`
- Category: layout
- Description: Administrative page viewport aligned to the authenticated workspace rail.
- Extractable props: current tab, heading, body.
- Hardcoded: admin density and responsive framing.

## Basic Components

### Button
- Source: `src/components/atoms/Button.tsx`
- Category: basic
- Description: Canonical Wireline action control with five intent variants and three sizes.
- Extractable props: `variant`, `size`, `loading`, `leftIcon`, `rightIcon`, native button props.
- Hardcoded: CVA class map, loader treatment, focus and motion behavior.

### Input
- Source: `src/components/atoms/Input.tsx`
- Category: basic
- Description: Canonical text control for workspace and auth forms.
- Extractable props: native input props and `className`.
- Hardcoded: height, borders, focus ring, disabled and placeholder tokens.

### NativeSelect
- Source: `src/components/atoms/NativeSelect.tsx`
- Category: basic
- Description: Styled browser-native selection control.
- Extractable props: native select props and `className`.
- Hardcoded: chevron treatment, size, surface, and focus styles.

### Switch
- Source: `src/components/atoms/Switch.tsx`
- Category: basic
- Description: Accessible binary setting control on Radix Switch.
- Extractable props: `checked`, `defaultChecked`, `disabled`, `onCheckedChange`, label linkage.
- Hardcoded: dimensions, thumb motion, focus treatment, and semantic colors.

### Badge
- Source: `src/components/atoms/Badge.tsx`
- Category: basic
- Description: Compact semantic status and category label.
- Extractable props: `variant`, `children`.
- Hardcoded: variant palette, radius, weight, and tracking.

### Dialog
- Source: `src/components/atoms/Dialog.tsx`
- Category: basic
- Description: Modal building blocks for title, description, content, close, and actions.
- Extractable props: `open`, `defaultOpen`, `onOpenChange`, trigger/content children.
- Hardcoded: overlay, elevation, responsive bounds, close icon, motion classes.

### Card
- Source: `src/components/molecules/Card.tsx`
- Category: basic
- Description: Shared operational surface with header, content, footer, and optional interactive behavior.
- Extractable props: `variant`, `interactive`, `children`, section content.
- Hardcoded: borders, shadows, background tokens, radius, and spacing.

### FormField
- Source: `src/components/molecules/FormField.tsx`
- Category: basic
- Description: Form label, description, required indicator, control, and error contract.
- Extractable props: `label`, `description`, `error`, `required`, `htmlFor`, `children`.
- Hardcoded: semantic ordering, error presentation, spacing and typography.

### MetricCard
- Source: `src/components/molecules/MetricCard.tsx`
- Category: basic
- Description: Operational KPI tile with value, trend, supporting label, and state.
- Extractable props: title/value/trend/tone and optional action or icon.
- Hardcoded: typography, trend presentation, surface and spacing.

### SectionHeader
- Source: `src/components/ui/SectionHeader.tsx`
- Category: basic
- Description: Reusable section title and supporting-copy hierarchy.
- Extractable props: eyebrow, title, description, actions, alignment.
- Hardcoded: typography scale and spacing.

### EmptyState
- Source: `src/components/atoms/EmptyState.tsx`
- Category: basic
- Description: Actionable zero-data or no-result state.
- Extractable props: icon, title, description, action, compact state.
- Hardcoded: hierarchy, icon frame and layout treatment.

### MetricStatTile
- Source: `src/components/ui/MetricStatTile.tsx`
- Category: basic
- Description: Compact metric surface used in denser dashboards and side panels.
- Extractable props: label, value, detail, tone.
- Hardcoded: type ramp, token mapping, and spacing.
