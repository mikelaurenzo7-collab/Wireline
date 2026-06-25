# Visual & Action-First Public Pages — Reduce Text, Prove by Doing

## Context
Following the successful reduction of textual density on the main landing (PrecisionLanding.tsx), we are continuing the direction: "prove by actions, not words." The design system (tokens, typography, contrast) is now excellent; the problem is overload of branding words, repetitive explanations ("your rules", "handles calls/email/text", long paragraphs), and lists that make pages feel chaotic and unclear ("I don't know what I'm looking at").

Previous changes:
- Replaced OperatingModel text block with HeroCallPreview.
- Added live BrowserCallWidget demo.
- Shortened channel bodies and hero copy.
- Trimmed headers, footers, some Features copy.

Current state shows similar patterns in:
- VerticalLanding.tsx (pains, sequence, capabilities, long subheads)
- SolutionsPage.tsx (descriptions, multi-line sequences, capabilities)
- Pricing.tsx (long intro, FAQ blocks)
- Showcase.tsx (STEPS list, descriptions)
- About.tsx (principles with copy, paragraphs)
- Compare.tsx (differences with copy, table)
- Other marketing components (TrustSignals, RoiCalculator are good but can integrate better)

Goal: Pages feel visual, scannable, product-led. Users see and *do* things (demos, previews, interactions) before reading. Minimal branding repetition. Leverage existing design system and demo components.

## Goals
- Primary: Drastically reduce word count and repetitive phrasing on public marketing surfaces.
- Make "what it is" obvious through visuals and live actions (demos, previews, widgets).
- Use design system hierarchy + whitespace for clarity instead of more text.
- Consistent "action first" pattern across pages.
- Maintain SEO/meta but de-emphasize in UI.

## Non-Goals
- Rewrite internal app UI (focus public/landing surfaces).
- Add new heavy visuals or animations (reuse/extend HeroCallPreview, BrowserCallWidget, RobotHead, integration strips).
- Change design system or tokens.
- Full rewrite of every page in one go (incremental, per-page).

## Scope
- High priority: VerticalLanding, SolutionsPage, Pricing, Showcase, About, Compare.
- Supporting: Features (follow-up trim), marketing components if needed, public headers/footers if still wordy.
- Leverage: BrowserCallWidget, HeroCallPreview, existing data configs (WEDGES, SOLUTIONS), design tokens for clean layouts.
- Deliver: Cleaner copy, visual swaps (cards over paragraphs, embedded demos), progressive disclosure where details needed.

## Success Criteria
- Pages feel "less text, more proof" — user can understand value in <10s scan + interact.
- Word count reduced ~40-60% on descriptive sections.
- At least 1-2 prominent live/visual actions per key page.
- No loss of information (details in demos, links, accordions if needed).
- Visual QA: better breathing room, hierarchy shines.
- All contracts pass; no new hardcodes.
- Feels professional, not salesy.

## Design

### General Principles
- Headlines: 1 strong line.
- Sub/copy: 1 short sentence max, or none.
- Replace "how it works" lists/sequences with:
  - Icon + short title cards.
  - Embedded HeroCallPreview or BrowserCallWidget.
  - Visual flows using existing strips.
- "Your agent/rules" phrasing: minimize to 1-2 instances per page; show via demo instead of tell.
- Branding: Logo + product name minimal; let visuals speak.
- Layout: Use wl-measure, grids, cards from design system for scannability. Add space where text was removed.
- Actions: Prominent "Try live", "See demo", CTAs with icons. Make demos the hero element.

### Per-Page Approach

**VerticalLanding.tsx**
- Hero: Keep config headline, shorten subhead to 1 line. Add prominent demo widget.
- Pains section: Icon cards with 1-line title only (move body to hover or remove).
- Sequence: Visual stepper or demo instead of text blocks.
- Capabilities/FAQs: Collapse or icon list.
- Add live preview at top.

**SolutionsPage.tsx**
- Hero: Short title + 1 sentence.
- Sequence: Turn into 3 visual steps with mini previews.
- Capabilities: Short 1-liners in grid.
- Proof line: Keep minimal.
- Embed BrowserCallWidget for the solution type.

**Pricing.tsx**
- Hero: Already somewhat good; trim intro.
- Tiers: Visual cards.
- FAQs: Keep but make questions prominent, answers short or accordioned. Promote the ROI calculator more.
- Balance emphasis: Visual.

**Showcase.tsx**
- Already has strong demo. Trim STEPS to visual numbered icons.
- Add more previews or multiple agent demos.
- "What to expect" as visuals.

**About.tsx**
- Principles: Visual icons + 1 line each.
- Long paras: Replace with story via visuals or short bullets.
- "Built with accountability": Visual + minimal text.

**Compare.tsx**
- Differences: Visual before/after or icon pairs instead of copy.
- Table: Convert to visual comparison cards or keep minimal.

**Cross-cutting**
- PublicHeader/Footer: Already trimmed; ensure no extra descriptive text.
- Add consistent "Live demo" module where appropriate.
- Use existing data (vertical-wedges, etc.) but render visually.
- Test with "scan test": can user answer "what does it do?" from visuals alone?

## Architecture / Implementation Notes
- No new components unless minimal (e.g., a VisualStep or reuse).
- Prefer search/replace for copy trims.
- Embed demos: <BrowserCallWidget />, <HeroCallPreview /> — they use design tokens.
- For data pages, enhance rendering to be card/visual heavy.
- After edits: run contracts, visual review (manual or script), eslint.
- Commit per page or logical group for review.
- Leverage typography vars for hierarchy to make remaining text pop without volume.

## Risks & Mitigations
- Loss of SEO/detail: Keep meta, use accordions for deep info if needed.
- Demos not working for all: Graceful, with "hear demo" links.
- Inconsistent across pages: Follow a template/pattern.
- Over-trim: Keep core value props.

## Next
After approval, detailed plan per page with exact trims + visual swaps.
Then execute, review (contracts + manual scan), merge.

This continues the "fonts/contrast better, now less overwhelming" direction for a clean, action-proving experience.