# Wireline Design System — One Voice

**Status:** active. This file is the design contract.

Wireline should feel simple, useful, and expensive without looking decorated. The product is a consumer-first AI call concierge with one console that can also support business workflows.

## Non-negotiables

1. **Left-align product pages and app screens.** Center only small badges, empty states, and modal confirmations.
2. **Titles are uppercase.** Use tight, confident labels; no mixed headline styles page-to-page.
3. **No large paragraphs.** Body copy should be one or two short lines. If it needs more, split it into bullets or remove it.
4. **No redundant marketing graphics.** One primary product proof per page is enough.
5. **No decorative components without a job.** If a card, subtitle, animation, or illustration does not help the user decide or act, delete it.
6. **Mobile must breathe.** Nothing should feel oversized on a phone; use clamp-based type and compact controls.
7. **Desktop gets premium spacing.** Wider screens should feel composed, not merely scaled-up mobile.

## Layout contract

- Max content width: `72rem` for marketing, app shells own their workspace width.
- Page gutters: `clamp(1rem, 3vw, 2.5rem)`.
- Section rhythm: `clamp(3rem, 7vw, 6rem)`.
- Text alignment: **left by default** across marketing, auth, the single app console, iOS, and Android.
- CTAs: left-aligned with content; center only in empty states.

## Type contract

- Display: Fraunces for major titles only.
- UI/body: Plus Jakarta Sans / native system sans.
- Labels: mono, uppercase, tracked.
- Title size: `clamp(2.25rem, 7vw, 5.75rem)` on web; native large title should be strong but not huge.
- Body size: `clamp(0.98rem, 1.6vw, 1.2rem)`.
- Body measure: 52 characters max.

## Color contract

Three-color discipline:

- Lavender canvas: `#F3EFFA`
- Violet action/accent: `#7C3AED`
- Charcoal text/depth: `#1E1B2E`

Authenticated consoles may invert into charcoal via `.wl-console-surface`; do not invent another palette.

## Component contract

- Prefer primitives and semantic tokens over one-off classes.
- Cards need a purpose: decision, status, input, or proof.
- Eyebrows are optional; subtitles are suspect. Do not stack eyebrow + title + subtitle + paragraph unless the page truly needs all four.
- Keep radii moderate and consistent.
- Motion should be subtle and never required to understand the UI.

## Root cause found

Design drift came from too many overlapping contracts, not too little taste:

- `DESIGN.md`, `docs/DESIGN_SYSTEM.md`, audit reports, marketing-kit notes, and legacy Grok guidance described different products.
- Old visual tests and ratchets encouraged preserving layers instead of deleting dead ones.
- The app accumulated compatibility aliases and page-local hero patterns, so every new change added another exception.
- Native apps had their own “premium” treatments instead of a shared alignment, type, and density rule.

The fix is this single short contract plus `src/index.css` tokens, consumer-first pricing, and one configurable console instead of separate personal/business product stories. Legacy docs may explain history, but they are not allowed to create new rules.

## Verification

For UI work, check:

- Does the screen use one alignment model?
- Are titles uppercase?
- Is body copy short?
- Did we remove at least as much as we added?
- Does mobile feel smaller and desktop feel more deliberate?
