# Wireline Design System

## Product and audience

Wireline is an operating system for small and midsize service businesses that need dependable AI voice agents for sales, front-desk, support, booking, follow-up, and CRM work. The public experience must establish trust quickly, make the agent concrete through a live demo, explain the operating loop, and move a qualified visitor into a free draft or a paid plan without overstating capabilities.

Core jobs:

- Hear a real agent before committing.
- Understand what the agent does before, during, and after a conversation.
- Compare plans, limits, included channels, and pricing without ambiguity.
- Start a private draft, then activate live channels only after a paid plan and required configuration.
- Preserve an operational, trustworthy tone appropriate for customer communications and billing.

## Visual identity

The canonical identity is **Aurora Letterpress**: a near-black violet canvas, layered charcoal-violet surfaces, precise silver rules, electric lavender primary actions, and restrained semantic status colors. It should feel calm, exact, substantial, and quietly advanced. Avoid generic SaaS gradients, glass-heavy decoration, neon cyberpunk styling, playful illustration, excessive pills, and ornamental motion.

Use only these type families:

- Display: `Inter Tight`
- Body and UI: `Inter`
- Operational data and labels: `IBM Plex Mono`

Use only these core dark-mode colors:

- Canvas: `#0A0A0E`; deeper `#050508`; warmer `#101018`
- Surfaces: `#100F15`, `#141319`, `#18161E`, `#201E29`, `#262330`
- Text: primary `#F5F4F8`; secondary `#B6B1C6`; tertiary `#8B87A0`
- Primary action: `#A78BFA`; hover `#C4B5FD`; pressed `#8B5CF6`; container `#1E1730`
- Secondary action: silver `#C7CCD6`; container `#1C1D22`
- Borders: soft `#1C1A22`; default `#262430`; strong `#3A3745`
- Status: success `#4ADE9A`; warning `#E8B85C`; error `#EF7B92`; info `#93A0C7`

Light mode is optional and only activated by `html.light`: canvas `#F6F5FA`, surface `#FFFFFF`, text `#171426`, primary `#6D28D9`.

## Typography

- Marketing display: 56/60, weight 720, tracking -0.045em
- H1: 40/46, weight 700, tracking -0.04em
- H2: 30/36, weight 680, tracking -0.035em
- H3: 22/30, weight 650, tracking -0.025em
- Body: 16/26, weight 400
- Strong body: 16/26, weight 650
- Caption: 13/19, weight 500
- Overline: 11/16, weight 700, tracking 0.09em

Keep line lengths deliberate: large headlines roughly 12–18 characters per line where practical, supporting copy around 52–68 characters. Preserve sentence case for explanatory copy; use compact uppercase only for operational labels and overlines.

## Layout and rhythm

- Marketing rail: 1088px maximum.
- Authenticated content: 1152px maximum.
- Public section spacing: 48–76px depending on viewport; use consistent vertical cadence.
- Spacing scale: 2, 4, 6, 8, 10, 12, 16, 24, 32, 40, 48, 64px.
- Touch targets: 40px minimum, 44px comfortable, 48px primary.
- Use a clear editorial hierarchy, strong alignment, and quiet dividing rules instead of floating-card overload.
- Mobile layouts must remain a single readable column with full-width primary actions and no horizontal overflow.

## Shape, elevation, and motion

- Product radii: 6, 8, 10, and 12px. Marketing feature containers may use 16–20px. Reserve pill radius for badges, segmented controls, and compact status chips.
- Elevation is subtle: 1px edge definition and low-opacity long shadows. Avoid heavy blur and exaggerated floating layers.
- Focus rings use lavender or silver tokens and must remain clearly visible.
- Motion durations: 60, 120, 200, 300, 440ms. Primary easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Motion should explain state, hierarchy, or continuity. Honor reduced-motion preferences.

## Public landing-page contract

The home page uses the real Wireline header and footer around a vertical story:

1. Hero: truthful outcome-led headline, short proof copy, free-start primary CTA, live-demo secondary CTA, and an embedded live voice demo.
2. Live video spotlight: optional presenter capability presented as a paid add-on, never as simulated proof.
3. Four-step operating loop: Build, Train, Launch, Improve.
4. Work-lane selector: Outbound, Inbound, Hybrid with keyboard-accessible tabs and one contextual CTA.
5. Pricing preview: Free Builder, Starter, Starter Plus, Pro with explicit limits and no hidden activation promises.
6. Trust signals and a focused closing CTA.

The live-demo surface must always be truthful. When browser voice is configured it may say “Start the live demo.” When it is unavailable, the fallback must identify itself as a phone call and emit the same funnel intent event with a distinct mode.

## Components and interaction rules

- Primary CTA: solid lavender action, dark text, minimum 48px target for hero and conversion moments.
- Secondary CTA: silver/dark outlined treatment with equal target size.
- Navigation must preserve clear active/hover/focus states and collapse cleanly on mobile.
- Tabs use semantic `tablist`, `tab`, and `tabpanel` roles with arrow, Home, and End keyboard support.
- Inputs expose labels, errors, requirements, and focus states without relying on color alone.
- Pricing switches update amounts, periods, savings language, and destination URLs together.
- Never render a dead control. Provide a truthful fallback or remove the unavailable action.
- Use Lucide icons already present in the application; do not substitute emoji or handcrafted SVGs.

## Content principles

- Lead with completed work and business outcomes, not model names.
- Be explicit about limits, add-ons, required setup, and what activates only after payment.
- Prefer “voice agent,” “live voice demo,” “book the meeting,” and “log the outcome” over vague AI language.
- Avoid unsupported superlatives, fabricated customer evidence, fake activity, fake urgency, and claims that imply legal, tax, or compliance guarantees.
- Use realistic operational language and keep one primary action per section.

## Accessibility and quality bar

- Meet WCAG 2.2 AA contrast and interaction expectations.
- Preserve visible focus, keyboard navigation, reduced motion, semantic headings, accessible labels, and minimum target sizes.
- Verify at mobile, tablet, and desktop widths. No clipped text, overflow, misplaced fixed layers, or obstructed CTAs.
- Every public flow must remain honest when third-party keys, microphone access, or network services are unavailable.
