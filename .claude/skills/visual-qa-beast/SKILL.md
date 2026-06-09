---
name: visual-qa-beast
description: Visual QA & Pixel-Perfect Polish auditor. Focuses on layout alignment, interactive states, responsive integrity, and high-fidelity rendering validation.
---

# Visual QA Beast Skill 👁️🛡️

Use this skill to perform strict, pixel-level visual audits of any modified or newly designed pages, components, and layouts. This ensures that every pixel earns its keep and the final output is defect-free.

## The Visual Audit Blueprint

### 1. Spacing, Grid & Alignment Integrity
- **The Spacing Grid**: Ensure all vertical and horizontal spacing (margins, padding) maps to a consistent spacing scale (e.g. multiples of 4px / 8px). Do not mix arbitrary values (like `p-3.5` with `p-4.5`).
- **Baseline Alignment**: Text lines, labels, icons, and buttons must align precisely. Use flex alignment (`items-center`, `items-baseline`) and avoid hardcoded offsets (e.g. `mt-[1px]`) which break across viewports or fonts.
- **Defensive Spacing**: Check for text wrapping. Use `truncate`, `line-clamp`, or proper min-widths to prevent labels from colliding with buttons or icon boundaries.
- **Specularity and Borders**: Never overlap borders or double-up dividers. Group elements cleanly using shadows (`.elev-*`) and transparent layers (`.glass-*`) instead of adding solid borders.

### 2. The Interactive State Checklist
An interface is dead without tactile feedback. Every interactive element must be verified for 5 states:
1. **Idle**: Clean typography, clear purpose, subtle styling.
2. **Hover**: Smooth transformation (e.g., scale lift `hover:scale-[1.015]` or translate `hover:-translate-y-0.5`), border glow, or backdrop color mix changes.
3. **Active/Press**: Zero-latency scale down (`.touch-press` or `.touch-press-deep`) indicating physical contact.
4. **Focus**: Generous, high-contrast, rounded ring outlines on keyboard focus using `:focus-visible` (`focus-ring` / `focus-ring-dark`).
5. **Disabled**: Reduced opacity (`opacity-50`), disabled cursor (`cursor-not-allowed`), and inert click event handlers.

### 3. Responsive & Breakpoint Audits
A design is only as good as its weakest viewport. Check rendering at:
- **Mobile (390px / iPhone)**: Check that text sizes scale down (`text-[clamp(...)]`), padding is compact (typically `p-4` maximum), and compare columns collapse cleanly into rows. Check for horizontal scrollbars — there must be **zero** horizontal scroll overflow.
- **Tablet (768px - 834px)**: Check for flex wrapping or grid template column wrapping so content doesn't get squished.
- **Desktop (1440px / 1920px)**: Check that text columns have set max-widths (typically max-w-xl to max-w-3xl) to keep reading lines comfortable.

### 4. Color, Contrast & Blend Safety
- **High-Contrast Readability**: Ensure text has a contrast ratio of at least 4.5:1 against its background. Verify that dark mode handles text contrast correctly and doesn't leave muted text unreadable.
- **Gradients**: Ensure gradient colors blend harmoniously. Never let a gradient fade to a raw transparent grey — blend toward transparent values of the same hue or use HSL color-mix.
- **Subtle Layering**: Check backdrop-filter blur levels. Ensure overlaid text is readable over changing background content by adding a translucent paper mask (e.g. `.glass-1` or `bg-paper/85`).

## The Verification Loop

Whenever you apply this skill to verify a task:
1. **Look**: Start the local server and use browser snapshot tools or `browser_subagent` to render the pages.
2. **Audit**: Systematically go down the layout, interactive states, responsive design, and contrast checklists.
3. **Refine**: Correct any micro-misalignments, redundant CSS classes, or low-contrast colors.
4. **Validate**: Run production build tests to verify that typechecks, ESLint limits, and bundle compilation succeed without error.
