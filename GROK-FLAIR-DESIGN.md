# GROK-FLAIR Design Language

**Version:** 1.0 · **Date:** 2026-06-19 · **Author:** Grok (xAI lens on Wireline)
**Philosophy:** World-class, purposeful, spacious, bold yet refined. Every pixel earns its place. "High-end amateur" → "instantly premium, editorially confident, operationally calm."

## Core Principles (GROK-FLAIR)
1. **Spacious by default** — Negative space is the primary layout tool. Density is earned, never default.
2. **Editorial hierarchy** — Typography and rhythm do 80% of the communication work; color accents only for action/meaning.
3. **Purposeful motion** — Spring physics, purposeful reveals, never decoration. Respect reduced-motion.
4. **Canvas-first tools** — Agent Studio and ops surfaces feel like a workspace, not a form stack.
5. **Signature details** — Subtle "Grok flare": razor-sharp hairlines, generous 12px+ radius on key surfaces, micro-glow on primary CTAs, tabular numerals everywhere metrics appear.
6. **One strong accent** — Deep void black + electric iris + warm cream highlights. No competing palettes.

## Tokens (extend src/index.css)

### Color — GROK-FLAIR Dark (source of truth)
```css
--flair-void: #050507;          /* Deepest canvas */
--flair-panel: #0F1118;         /* Primary surface */
--flair-raised: #161A24;        /* Cards, elevated */
--flair-highest: #1F242F;       /* Hover / active */
--flair-text: #F5F6FA;
--flair-text-2: #A8ABB8;
--flair-text-3: #6B6F7C;
--flair-iris: #6E8CFF;          /* Primary action / focus */
--flair-iris-bright: #9FB3FF;
--flair-cream: #F4EDE3;         /* Signature Wireline highlight (used sparingly) */
--flair-mint: #4DE0B0;
--flair-amber: #F5B55A;
--flair-border: rgba(255,255,255,0.08);
--flair-border-strong: rgba(255,255,255,0.14);
```

### Typography
- Display: Inter (or system-ui) with optical sizing, tracking -0.02em on H1/H2.
- UI: Inter, weights 400/500/600 only.
- Mono: JetBrains Mono or SF Mono for labels/metrics.
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 40 / 56 (modular, line-heights 1.1–1.4)

### Spacing & Density
- Base unit: 4px
- Section rhythm: 48px–72px vertical (generous)
- Component padding: 16px / 20px / 24px (sm/md/lg)
- Density modifiers: `.flair-dense` (tighten to 12px rhythm for data tables), `.flair-airy` (default for marketing + studio canvas)

### Radius & Elevation
- sm: 8px, md: 14px, lg: 20px, xl: 28px
- Elevation: 0 (flat), 1 (subtle lift), 2 (workspace canvas), 3 (modal/floating)
- Signature: 1px top-left highlight inset on raised panels + soft 0 4px 24px rgba(0,0,0,0.4)

### Motion
- Duration: 180ms (micro), 280ms (standard), 420ms (major reveal)
- Easing: `cubic-bezier(0.23, 1, 0.32, 1)` (Grok spring)
- Reduced motion: instant for all but essential feedback
- Signature interactions: card lift on drag hover, spring scale on primary CTA press, smooth canvas panning

## Density Rules
- Marketing pages: Airy (72px+ sections, max 65ch prose)
- Auth portal: Centered, generous hero side panel with editorial illustration space
- Agent Studio: Canvas workspace — left palette (tools), center infinite canvas, right inspector. Drag-and-drop is the primary training gesture.
- Ops/Command: Task-dense but breathable; sticky headers, collapsible side panels.

## Anti-Patterns (GROK-FLAIR rejects)
- Cluttered stacked cards without breathing room
- Purple gradients or "AI glow" cliches
- Tiny tap targets, cramped forms
- Generic three-column feature grids without narrative flow
- Form-heavy "studio" that feels like a spreadsheet

This language replaces Midnight. All future surfaces inherit these tokens.
