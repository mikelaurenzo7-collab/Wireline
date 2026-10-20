# BotBound Design System

## Product and audience

BotBound gives individuals and very small businesses a Bot with a computer, phone number, and email address. The core jobs are answering callers, handling email, coordinating appointments, and completing supervised web tasks. A CRM is optional. The public experience makes these capabilities concrete and moves a visitor into a free draft without overstating what is enabled.

This document specifies the existing BotBound system. Executable sources win when a value changes: `design-tokens/wireline.tokens.json`, `src/styles/theme-light.css`, `src/lib/wireline-design-vision.ts`, and `src/constants/navigation.ts`. Extend those sources and regenerate their outputs; do not create another theme or token registry.

### Voice and personality

Be precise, calm, capable, and collaborative. Say what happened, what needs attention, and the next useful action. Use ordinary language for personal and business work. Keep technical detail in activity records and diagnostics unless it changes a decision.

| Situation                       | Preferred language                        | Avoid                                            |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| Established Bot                 | Instructions                              | Change Your Bot                                  |
| Empty instructions conversation | Clear canvas and a useful composer        | A large headline suggesting the Bot needs fixing |
| Working                         | Opening the booking page                  | Thinking deeply or invented progress             |
| Owner checkpoint                | Sign in to continue                       | Vague permission errors                          |
| Interrupted work                | Connection lost. Your draft is saved.     | Something went wrong without recovery            |
| Result                          | Email sent, when the provider accepted it | Delivered without delivery evidence              |

Do not use hyphens or em dashes in customer prose. Preserve technical identifiers, email addresses, dates, and customer authored text. Avoid descriptions that repeat the control beside them.

### Design metaphor and benchmark principles

Use a clear workspace with a visible working surface: the Bot's conversation or browser is the focus, its controls sit beside that work, and supporting evidence opens on demand. Transparency means useful actions and evidence, not decorative glass or exposed private model reasoning.

Take typography and restraint from the brief's Claude reference, conversational continuity from ChatGPT, and keyboard efficiency and density from Cursor. These are design principles, not claims about current competitor capabilities. Retain BotBound's identity rather than imitating another product.

Core jobs:

- Understand the Bot before committing; test privately after account setup.
- Understand what the agent does before, during, and after a conversation.
- Compare plans, limits, included channels, and pricing without ambiguity.
- Start a private draft, then activate live channels only after a paid plan and required configuration.
- Preserve an operational, trustworthy tone appropriate for customer communications and billing.

## Visual identity

The canonical identity is the **BotBound Design System**: a near-black violet canvas, layered charcoal-violet surfaces, precise silver rules, electric lavender primary actions, and restrained semantic status colors. It should feel calm, exact, substantial, and quietly advanced. Avoid generic SaaS gradients, glass-heavy decoration, neon cyberpunk styling, playful illustration, excessive pills, and ornamental motion. Use semantic names for surfaces and colors; do not introduce separate named themes.

Use only these type families:

- Display: `Inter Tight`
- Body and UI: `Inter`
- Operational data and labels: `IBM Plex Mono`

Use only these core dark-mode colors:

- Canvas: `#0A0A0E`; deeper `#050508`; warmer `#101018`
- Surfaces: `#100F15`, `#141319`, `#18161E`, `#201E29`, `#262330`
- Text: primary `#F5F4F8`; secondary `#B6B1C6`; tertiary `#908CA5`
- Primary action: `#A78BFA`; hover `#C4B5FD`; pressed `#8B5CF6`; container `#1E1730`
- Secondary action: silver `#C7CCD6`; container `#1C1D22`
- Borders: soft `#1C1A22`; default `#262430`; strong `#3A3745`
- Status: success `#4ADE9A`; warning `#E8B85C`; error `#EF7B92`; info `#93A0C7`

Dark is the first-visit appearance. A saved light, dark, or system preference always wins. Light mode uses `html.light`: canvas `#F6F5FA`, surface `#FFFFFF`, text `#171426`, primary `#6D28D9`. Both appearances use the same component and interaction system. The executable manifest is `src/lib/wireline-design-vision.ts`; `ThemeContext` applies the preference.

## Typography

- Marketing display: 56/60, weight 720, tracking -0.025em
- H1: 40/46, weight 700, tracking -0.022em
- H2: 30/36, weight 680, tracking -0.02em
- H3: 22/30, weight 650, tracking -0.015em
- Body: 16/26, weight 400
- Strong body: 16/26, weight 650
- Caption: 13/19, weight 500
- Overline: 11/16, weight 700, tracking 0.09em

Author every title and heading in **Title Case**: heroes, page titles, section titles, cards, dialogs, and empty-state titles. Preserve proper names and acronyms; keep short articles, conjunctions, and prepositions lowercase unless they begin or end the title. Titles do not end in a period; questions keep their question mark. CSS must preserve authored title casing, including titles rendered through shared components or portals.

Use the available layout width for headlines and let them wrap naturally on small screens. Supporting copy should stay around 52–68 characters per line. Preserve sentence case for explanatory copy and the exact casing of customer-authored text. Compact uppercase is reserved for operational labels, overlines, and deliberately cased controls.

## Layout and rhythm

- Marketing rail: 1088px maximum.
- Authenticated content: 1152px maximum.
- Public section spacing: 48–76px depending on viewport; use consistent vertical cadence.
- Spacing scale: 2, 4, 6, 8, 10, 12, 16, 24, 32, 40, 48, 64px.
- Touch targets: 44px minimum for mobile controls, 48px for primary conversion actions.
- Use a clear editorial hierarchy, strong alignment, and quiet dividing rules instead of floating-card overload.
- Mobile layouts must remain a single readable column with full-width primary actions and no horizontal overflow.

## Shape, elevation, and motion

- Product radii: 6, 8, 10, and 12px. Marketing feature containers may use 16–20px. Reserve pill radius for badges, segmented controls, and compact status chips.
- Shared text fields and select triggers use the 12px product radius. Tertiary text must reach 4.5:1 on every standard surface, including container and strong surfaces, in both appearances.
- Elevation is subtle: 1px edge definition and low-opacity long shadows. Avoid heavy blur and exaggerated floating layers.
- Focus rings use lavender or silver tokens and must remain clearly visible.
- Motion durations: 60, 120, 200, 300, 440ms. Primary easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Motion should explain state, hierarchy, or continuity. Honor reduced-motion preferences.

## Public landing-page contract

The home page uses the shared BotBound header and footer around a vertical story:

1. Hero: preserve "Voice Bots With a Computer, Phone Number, and Email Address." with a free start primary action and no subhero.
2. Product preview: clearly illustrated examples of incoming calls, email, and computer tasks. SMS and campaign calling stay out of the launch story. Examples are never presented as real customer activity.
3. Keep public copy focused on capability and outcomes. Do not add setup-step lists or repeated process slogans; operational setup guidance belongs inside the product.
4. Roles: useful starting points for one configurable Bot.
5. Pricing: Free Builder, Calls, Email, and Calls + Email with current capacity tiers, explicit limits, and billing periods from `src/lib/plan-catalog.ts`.
6. A focused closing action.

Public routes do not offer anonymous live calling. Private tests and live calling require the relevant account, plan, and provider configuration. LiveAvatar and live talking-head video are retired; do not promote them as an add-on or launch dependency.

## Components and interaction rules

- Primary CTA: solid lavender action, dark text, minimum 48px target for hero and conversion moments.
- Secondary CTA: silver/dark outlined treatment with equal target size.
- Navigation must preserve clear active/hover/focus states and collapse cleanly on mobile.
- Supporting public pages expose only Features, Pricing, and account entry in their header. Use a compact menu on phones; the homepage retains its dedicated product entrance.
- Tabs use semantic `tablist`, `tab`, and `tabpanel` roles with arrow, Home, and End keyboard support.
- Inputs expose labels, errors, requirements, and focus states without relying on color alone.
- Pricing switches update amounts, periods, savings language, and destination URLs together.
- Never render a dead control. Provide a truthful fallback or remove the unavailable action.
- Use Lucide icons already present in the application; do not substitute emoji or handcrafted SVGs.
- Show saved Bot identity marks in roster and comparison lists, or inside an explicitly opened appearance picker. Use the Bot's name in single-Bot headers, navigation context, conversations, creation summaries, and voice tests. Keep appearance controls secondary to the Bot's working setup.

## Content principles

- Lead with completed work and business outcomes, not model names.
- Be explicit about limits, add-ons, required setup, and what activates only after payment.
- Use Bot as the product noun. Prefer concrete outcomes such as “book the meeting” and “log the outcome.”
- Avoid unsupported superlatives, fabricated customer evidence, fake activity, fake urgency, and claims that imply legal, tax, or compliance guarantees.
- Use realistic operational language and keep one primary action per section.

## Accessibility and quality bar

- Meet WCAG 2.2 AA contrast and interaction expectations.
- Preserve visible focus, keyboard navigation, reduced motion, semantic headings, accessible labels, and minimum target sizes.
- Verify at mobile, tablet, and desktop widths. No clipped text, overflow, misplaced fixed layers, or obstructed CTAs.
- Every public flow must remain honest when third-party keys, microphone access, or network services are unavailable.
- Creation asks for a role and a brief. Name and appearance are optional disclosures; deeper configuration belongs in Studio.
- Preserve unsaved Studio setup edits while switching panels, Bots, or responsive layouts. Keep drafts scoped to the current account and clear them after confirmed saves.
- An explicit Inbox filter must never silently become an unfiltered request during loading or failure.
- Use the shared atoms and canonical tokens in `design-tokens/wireline.tokens.json`; do not add a competing CSS theme.

## Information Architecture and Core Flows

The global shell stays stable while the main work changes. The desktop rail defaults to icons, with accessible names and labels on hover or keyboard focus. Expansion is optional. A Bot switcher names the current context; navigation into Bot work must retain that selection.

| Destination | Purpose                                              | Supporting surfaces             |
| ----------- | ---------------------------------------------------- | ------------------------------- |
| Workspace   | Instruct and operate the selected Bot                | Set Up, Knowledge, Computer     |
| Set Up      | Instructions conversation and reviewed configuration | Try It, Details, Summary        |
| Knowledge   | Sources, facts, and behavior                         | Existing Training controls      |
| Computer    | Current goal, browser, owner controls, and result    | History and Activity drawers    |
| Inbox       | Email conversations and decisions                    | Approvals                       |
| Calls       | History and reviewed calls                           | Lines and call report           |
| Calendar    | Availability and appointments                        | Booking rules                   |
| Insights    | Performance and usage                                | Evidence and metric definitions |
| Connections | Optional channels and external tools                 | Setup status and repair actions |
| Settings    | Account, billing, appearance, team, and apps         | Security and administration     |

The route registry owns destinations and shortcuts. Do not create another navigation array for this table. On phones, use the existing Bot, Inbox, Calls, Insights, and More dock. Calendar, Connections, and Settings remain in More.

### Instruct and Rehearse

1. Choose the Bot and keep its name visible.
2. Enter instructions or knowledge in the composer. An empty instructions canvas needs no promotional headline.
3. Review proposed changes before saving. Preserve drafts when changing tabs or panel widths.
4. Open Try It and choose Voice or Typed. Private rehearsal and calls to a live line remain visibly distinct.
5. End the rehearsal without losing the transcript or setup context.

### Give the Computer Work

1. Enter Computer with the current Bot retained. Explicit Computer navigation gives the task the main working area. A side panel remains available during setup.
2. Describe the goal or open a starting page. Keep one primary start action.
3. Show the current browser, task status, and available controls together. Show Activity when the owner asks for details.
4. If input is required, explain the specific checkpoint and show the response or takeover action that is actually supported.
5. After completion, prioritize the result and its sources. Explain that the live screen has been cleared when that is true.
6. If the task ended unsuccessfully, retain its record and offer New task. Never imply that a terminal browser session can resume unless the server supports it.

### Context, Artifacts, and Search

Keep activity tied to its task, transcripts tied to their call, and source files tied to Knowledge. Use a drawer for supporting details so the primary task remains readable. Generated files should show name, type, source task, availability, and a real open or download action when supported. A unified artifact library is future work, not a current navigation promise.

The command palette searches destinations and actions today. Retain its keyboard focus trap, arrow selection, Enter activation, Escape dismissal, and focus restoration. Preserve Bot context in commands. Conversation or task history search should only be advertised after a real indexed search source exists.

## Semantic Token Architecture

The JSON token source already supplies typed values and generated web, extension, and native outputs. Light mode overrides the same semantic CSS names. The table below documents roles, not a second source to edit.

| Semantic role   | Dark      | Light     |
| --------------- | --------- | --------- |
| Canvas          | `#0A0A0E` | `#F6F5FA` |
| Default surface | `#141319` | `#FFFFFF` |
| Subtle surface  | `#100F15` | `#F1EFF7` |
| Raised surface  | `#201E29` | `#FFFFFF` |
| Primary text    | `#F5F4F8` | `#171426` |
| Secondary text  | `#B6B1C6` | `#5B5770` |
| Tertiary text   | `#908CA5` | `#625C76` |
| Primary action  | `#A78BFA` | `#6D28D9` |
| Text on action  | `#0E0B16` | `#FFFFFF` |
| Default border  | `#262430` | `#E1DEEA` |
| Strong border   | `#3A3745` | `#C9C4D9` |
| Success         | `#4ADE9A` | `#127548` |
| Warning         | `#E8B85C` | `#8A5C07` |
| Error           | `#EF7B92` | `#B83648` |
| Information     | `#93A0C7` | `#46577A` |

Working is an activity state, not a new status color. Use the primary action family for active focus, the information family for neutral progress, warning for a checkpoint, and error for failure. Pair status color with text or an icon. Do not make green mean both active and successfully finished.

Consume semantic variables in component styles, for example:

```css
.task-surface {
  color: var(--wireline-color-text-primary);
  background: var(--wireline-color-surface-default);
  border: 1px solid var(--wireline-color-border-default);
  border-radius: var(--wireline-radius-lg);
  padding: var(--wireline-space-200);
  gap: var(--wireline-space-150);
  transition: border-color var(--wireline-motion-duration-standard)
    var(--wireline-motion-easing-standard);
}
```

Prefer space and type hierarchy first, a divider second, a surface tint third, and elevation only when a layer must separate. Use a 4px base and an 8px rhythm; the existing 2px, 6px, and 10px tokens support optical adjustments. Reserve large display type for marketing. Routine workspace labels and content should not compete with the active task.

## Component Specifications

### Voice Interaction Bar

Owner: `OpenAILiveVoiceSandbox.tsx`, styled in `precision-studio.css`.

| State      | Visible feedback                                             | Controls and behavior                                                |
| ---------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Idle       | Start control; omit a repeated ready label in compact panels | Start rehearsal                                                      |
| Connecting | Connection status                                            | End, and a mute choice that applies to the eventual microphone track |
| Listening  | Listening, or Microphone muted                               | Mute or Unmute, End                                                  |
| Processing | Grounded activity label                                      | Preserve independent microphone status                               |
| Speaking   | Bot Speaking                                                 | Preserve independent microphone status and interruption handling     |
| Failed     | Specific failure and recovery                                | Release microphone and connection before reset                       |

Use one status surface. Put the live region on status text rather than the entire interactive toolbar. Keep controls at least 44px on touch surfaces. A decorative audio icon can identify voice; it must not imply measured volume. Show a waveform only when it is driven by actual audio samples, with separate input and output meaning and a static reduced motion alternative. A telephone test without audio telemetry must not invent listening or speaking activity.

### Computer Viewport and Controls

Owner: `ComputerPage.tsx` and `cloud-computer.css`.

The viewport is the primary surface during active computer work. Keep the current page and connection freshness intelligible. Pause or Take control must reflect checkpoint behavior: show Pausing until ownership changes. Stop must remain pending until the server confirms termination. Do not label either action as an instant rollback.

Owner input is enabled only with confirmed ownership and a usable current frame. Keep sensitive entry in the owner controlled browser. When a frame is stale or disconnected, show that state and retain an accessible exit. Do not silently type into a stale page.

Fullscreen must preserve a clear exit. Owner prompts and stop controls should remain reachable; until all controls are inside the fullscreen container, the user must be able to exit to the full work surface. Do not claim fullscreen interaction parity without checking these states.

### Action Record and Activity Drawer

Use a readable row or compact card with timestamp, action kind, short factual text, and source host when available. Do not repeat the whole goal in every row. Long URLs and content wrap inside the panel. Keep lists keyboard scrollable and preserve reading position during updates.

Separate operational notes from actions and results. A collapsed disclosure may summarize those notes. It must not be titled or marketed as access to hidden model reasoning. Thumbnail history is optional future work: add it only when actual retained frames, access controls, retention rules, and clear capture times exist.

### Error and Recovery

| Condition                 | Required response                                                  |
| ------------------------- | ------------------------------------------------------------------ |
| Request still pending     | Keep current content and show a bounded busy state                 |
| Input needed              | Name the missing input and focus the appropriate control           |
| Network loss              | Retain drafts and distinguish disconnected from stopped            |
| Microphone denied         | Explain browser permission recovery without repeated prompts       |
| Task ended unsuccessfully | Preserve its record and offer a supported next action              |
| Side effect uncertain     | Show unknown or pending; do not call it completed or retry blindly |
| Call ended                | Report call status separately from the task outcome                |

Rollback is not a generic feature. Undo may be offered only for an explicitly reversible operation with a real server contract. Calls, sent messages, and external submissions cannot be represented as universally reversible.

## Delivery Order and QA

1. Fix verified behavior and clarity defects in existing controls before changing visual identity.
2. Give explicit Computer navigation enough space and preserve Bot and draft context.
3. Keep voice state, mute state, and cleanup consistent with actual browser resources.
4. Keep instructions, action records, scores, and outcomes factual and easy to scan.
5. Validate changed components with focused behavior checks, then the repository verification gate. Do not repeat unaffected suites without a reason.
6. Compare the actual interface at desktop, tablet, and phone widths in both appearances. Inspect keyboard focus, text enlargement, reduced motion, loading, empty, failure, and recovery states.
7. Release only the reviewed source and verify the deployed version and service readiness. A healthy deployment does not establish successful provider delivery or full accessibility conformance.

Use `docs/design-system-responsive-roadmap.md` for the detailed QA scorecard and `docs/ACCESSIBILITY.md` for accessibility requirements and evidence limits. Record dated screenshots and findings in audit evidence, not in generated token files.
