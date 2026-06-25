# Visual & Action-First Public Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce textual density and branding words across public marketing pages; prioritize visuals, live demos, and actions to prove value. Extend the landing page improvements (less copy, HeroCallPreview + BrowserCallWidget) for scannable, product-led experiences.

**Architecture:** Trim copy in heroes/subheads/bodies/sequences to 1 strong line + visuals. Swap explanatory lists/paragraphs for icon cards, embedded previews/demos, short titles. Use existing demo components and design system (typography vars, cards, spacing) for hierarchy and breathing room. Data-driven pages (Vertical, Solutions) render visually from configs. No new heavy components.

**Tech Stack:** React/TSX, existing marketing components (BrowserCallWidget, HeroCallPreview, etc.), design tokens, Tailwind + wl- classes, lucide icons.

## Global Constraints
- Follow design system: use --wireline-typography-* , var(--wireline-*) , wl- classes, stitch cards.
- Preserve functionality: demos, CTAs, links, data configs.
- Reduce word count ~40-60% on descriptive sections; minimize "Wireline", repeated "rules/agent" phrasing.
- All changes must pass `node scripts/check-design-system-contract.mjs`, eslint, visual scan (less chaotic, actions visible).
- Incremental: one logical page/group per commit for review.
- Reuse: HeroCallPreview, BrowserCallWidget, existing icons/strips.
- Public surfaces only (focus landing/vertical/solutions/etc.).

---

### Task 1: Prep & Audit — Confirm current state and patterns

**Files:**
- Read/audit: Wireline/src/pages/VerticalLanding.tsx, SolutionsPage.tsx, Showcase.tsx, Pricing.tsx, About.tsx, Compare.tsx, Features.tsx (follow-up), src/components/marketing/*.tsx (TrustSignals, etc.)
- Docs: docs/superpowers/specs/2026-06-24-visual-action-public-pages.md

**Interfaces:**
- Consumes: Existing page structures, data (WEDGES, SOLUTIONS), demo components.
- Produces: List of exact text blocks to trim + visual replacement points.

- [ ] **Step 1: Run quick audit commands and note wordy sections**
Run:
```bash
cd Wireline
grep -l "p className.*text-.*leading" src/pages/VerticalLanding.tsx src/pages/SolutionsPage.tsx src/pages/Pricing.tsx src/pages/About.tsx src/pages/Compare.tsx src/pages/Showcase.tsx | head -5
```
Expected: Lists the files with paragraphs.

- [ ] **Step 2: Identify repeatable patterns**
Patterns to target (from spec):
- Long hero subheads/descriptions
- "sequence"/"how it works" multi-line arrays rendered as text
- Capability/pain lists with bodies
- Repeated overlines + explanatory copy
- Table vs visual

Document 5-7 specific blocks per page for replacement.

- [ ] **Step 3: Verify demo components are importable**
Run: 
```bash
cd Wireline
grep -E "BrowserCallWidget|HeroCallPreview" src/pages/*.tsx src/components/marketing/*.tsx
```
Expected: Already used in landing/showcase.

- [ ] **Step 4: Commit audit notes (optional)**
```bash
git add -A
git commit -m "chore: prep audit for visual-action public pages"
```

### Task 2: VerticalLanding.tsx — Visual pains + sequence, add demo

**Files:**
- Modify: Wireline/src/pages/VerticalLanding.tsx (hero, pains grid, sequence section, capabilities)
- Test: Manual browser load /for/personal and /solutions/sales ; scan for text volume

**Interfaces:**
- Consumes: cfg from vertical-wedges, existing CtaLink, icons.
- Produces: Shorter hero, visual cards, embedded demo.

- [ ] **Step 1: Shorten hero subhead and add demo**
Replace the long `p className="mt-6 max-w-2xl..."` with 1 sentence + insert <BrowserCallWidget /> near top of hero or after stat.

Example edit location ~lines 85-95:
```tsx
<p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
  {cfg.subhead}  // shorten to 1 line in data or inline
</p>
<div className="mt-4">
  <BrowserCallWidget agentName="Demo Assistant" />
</div>
```

- [ ] **Step 2: Convert pains to visual icon+title only cards**
In the grid:
```tsx
<article ...>
  <span>...</span>
  <h3>...</h3>
  {/* remove or comment <p>{pain.body}</p> */}
</article>
```
Keep 1-line title. If needed, add subtle title only.

- [ ] **Step 3: Replace sequence text blocks with visual flow or reuse preview**
The sequence section (~line 160+): turn text into numbered visual steps or embed HeroCallPreview.

- [ ] **Step 4: Trim capabilities/FAQs to short lists**
Similar shortening.

- [ ] **Step 5: Run page + contracts**
```bash
cd Wireline
npm run dev  # or build
node scripts/check-design-system-contract.mjs
```
Expected: Page loads cleanly, less text, demo visible. Contracts pass.

- [ ] **Step 6: Commit**
```bash
git add Wireline/src/pages/VerticalLanding.tsx
git commit -m "perf(marketing): visual-action VerticalLanding - demos + short copy"
```

### Task 3: SolutionsPage.tsx — Visual sequences and capabilities

**Files:**
- Modify: Wireline/src/pages/SolutionsPage.tsx

**Interfaces:**
- Consumes: SOLUTIONS data.
- Produces: Short hero, visual sequence.

- [ ] **Step 1: Hero trim**
Shorten title/description to 1-2 lines.

- [ ] **Step 2: Sequence to visual**
Replace the sequence render with icon grid or 3-column visual steps (reuse pattern from landing).

- [ ] **Step 3: Capabilities to short cards**
1-liner per item.

- [ ] **Step 4: Embed demo**
Add BrowserCallWidget tuned to the solution (sales/support).

- [ ] **Step 5: Verify + commit** (similar to Task 2)

### Task 4: Pricing.tsx — Emphasize visuals/calculator, trim intro + FAQs

**Files:**
- Modify: Wireline/src/pages/Pricing.tsx

- [ ] **Step 1: Hero intro trim**
Reduce the p after h1 to minimal.

- [ ] **Step 2: Promote calculator**
Ensure RoiCalculator or similar is prominent (it already is interactive).

- [ ] **Step 3: FAQs**
Keep questions, make answers very short or use existing accordion if present; else simple list.

- [ ] **Step 4: Visual balance cards**
Keep the preset visuals.

- [ ] **Step 5: Verify + commit**

### Task 5: Showcase.tsx — Enhance existing demo, trim lists

**Files:**
- Modify: Wireline/src/pages/Showcase.tsx

- [ ] **Step 1: Trim STEPS**
Convert the STEPS list to minimal numbered visuals/icons (already somewhat visual).

- [ ] **Step 2: Add more previews**
If space, duplicate or vary the BrowserCallWidget with different agents.

- [ ] **Step 3: "What to expect" visual**

- [ ] **Step 4: Verify + commit**

### Task 6: About.tsx — Visual principles

**Files:**
- Modify: Wireline/src/pages/About.tsx

- [ ] **Step 1: Hero trim**
1 sentence.

- [ ] **Step 2: PRINCIPLES**
Icon + title + 1 line max (or just title + visual).

- [ ] **Step 3: Long paras to short or remove**
Replace with key points or visuals.

- [ ] **Step 4: Verify + commit**

### Task 7: Compare.tsx — Visual differences

**Files:**
- Modify: Wireline/src/pages/Compare.tsx

- [ ] **Step 1: Hero + intro short**
- [ ] **Step 2: DIFFERENCES to icon pairs or visual before/after**
- [ ] **Step 3: TABLE to visual cards**
- [ ] **Step 4: Verify + commit**

### Task 8: Follow-up trims + cross-page polish (Features, headers if needed)

**Files:**
- Modify: Wireline/src/pages/Features.tsx (more trims if remaining)
- Optional: minor in TrustSignals/Roi if explanatory text heavy.

- [ ] **Step 1: Quick pass on Features**
Apply same 1-line rule.

- [ ] **Step 2: Global scan for repetitive branding**
Use grep for over-used phrases, trim.

- [ ] **Step 3: Ensure consistent demo placement**

- [ ] **Step 4: Full verification**
```bash
cd Wireline
node scripts/check-design-system-contract.mjs
node scripts/check-active-surface-drift.mjs
# manual: npm run dev, visit /, /for/personal, /solutions, /pricing, /showcase, /about, /compare
# Check: scannable, demos work, less text
```

- [ ] **Step 5: Commit group**
```bash
git add -A
git commit -m "perf(marketing): complete visual-action sweep - less text, more demos across public pages"
```

### Task 9: Review & Merge

**Files:** All modified + the spec/plan docs.

- [ ] **Step 1: Run full verify**
```bash
cd Wireline
npm run verify  # or the specific checks
```

- [ ] **Step 2: Visual/UX review**
- Open key pages.
- Scan test: Can user understand "what Wireline does" from visuals/demos in 5-10 seconds?
- Check no broken layouts, contrast good (already praised).
- Less "I don't know what I'm looking at".

- [ ] **Step 3: Commit any final polish**
- [ ] **Step 4: Push**
```bash
git push origin main
```

- [ ] **Step 5: Merge**
Create PR or direct merge if allowed: "feat: visual action first public pages".
Review for text reduction, action emphasis.
Merge to main.

## Notes for Executor
- Exact edits via search_replace for precision (long strings unique).
- Keep all CTAs, links, functionality.
- If a page uses config data, edit the render or shorten inline where possible.
- Prefer adding <HeroCallPreview /> or <BrowserCallWidget /> for proof.
- After each major task: test the page.
- Leverage the design system heavily for the "clean" feel now that text is reduced.
- If demo env key missing, the widget handles gracefully (as in landing).

This plan produces incremental, reviewable, testable improvements matching the spec.