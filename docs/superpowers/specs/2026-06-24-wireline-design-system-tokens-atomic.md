# Wireline Design System — Semantic Tokens as the Authoritative Source for Atomic Design

## Context
Wireline has a maturing atomic design system (atoms/molecules/organisms with cva + data-slot + shadcn compatibility wrappers) and a recently extended semantic design token system (design-tokens/wireline.tokens.json driving generation for web, browser extension, iOS, and Android).

Current state (verified via inspection):
- Tokens generate --wireline-* CSS vars + TS map + native files.
- Many atoms use cva + data-slot and some var(--radius-md) / wl- classes.
- Contracts in scripts/check-design-system-contract.mjs and check-atomic-design-completion.mjs enforce canonical usage and re-exports.
- Some mixing of legacy and new token references exists; ad-hoc styling is still possible.

The goal of this design is to make the semantic tokens the single source of truth that powers the atomic system across surfaces.

## Section 1: Goals / Non-Goals / Scope (updated with contract reality)

**Primary Goal**  
Make the design-tokens/wireline.tokens.json + generators the authoritative source for the entire atomic design system. New (and migrated) UI must be built from canonical atoms/molecules that derive styling from the tokens (via CSS vars, the TS map, or a clean mapping layer), with the existing CVA + data-slot + shadcn-compat pattern as the delivery mechanism. All surfaces (web, extension, iOS, Android) benefit.

**Success Signals (refined)**
- Core canonical atoms use token-derived values (or clean token-backed CVA variants).
- `npm run verify` + the design-token + atomic + design-system contract checks are green and expanded where needed.
- shadcn/ wrappers remain thin compatibility only.
- Token changes automatically flow (or are easy to flow) to native + extension.
- Reduced ad-hoc color/radius/spacing literals in feature code.
- All atoms, molecules, and updates must pass the expanded design-token-contract and design-system-contract as part of `npm run verify`.

**Non-Goals (this cycle)**
- Rewrite every organism/page in one PR.
- Change the visual language / introduce new hues (stay within current semantic tokens).
- Replace the CVA + data-slot ratchet pattern (enhance it instead).
- Full designer-to-code Figma sync (nice-to-have later).

**Scope (this cycle)**
- Token → atomic mapping strategy + a core set of atoms (Button, Card, Input family, Badge, Skeleton, Status/feedback, basic layout primitives).
- Updates to generators/checks as needed for atomic contracts.
- Documentation + examples of the “correct” way.
- Parity and generation for the surfaces already supported by the token script.
- Full migration of code and custom styles to --wireline-* tokens; legacy --wl-* aliases retained ONLY in foundation.css for backward compat during transition. No new --wl- allowed in src/.

## Approaches

**Approach 1: Compatibility alias layer (fastest path)**  
Extend the generator (or post-process) to emit the legacy `--radius-*`, `--wl-*`, and other vars that current code and checks expect, derived from the new semantic tokens. Atoms and components.css continue to reference the short/legacy names during transition. Contracts get only light updates.

*Trade-offs*: Quick wins, minimal atom changes. Leaves two "faces" on the token system; less clear that the JSON is the single source.

**Approach 2: Token-primary + full migration (chosen for perfect symmetry)**  
Update the canonical atoms, all custom styles, components, pages to directly use `--wireline-*` vars. Keep legacy --wl-* ONLY as thin aliases in foundation.css. Strengthen checks to require --wireline- in src/ (ban new --wl-). Update brand-colors.ts and consumers.

*Trade-offs*: Makes the new tokens clearly authoritative across monorepo. Requires migration of code and styles (done for symmetry). Native and extension receive generated. Achieves flawless cross-surface mastery.

**Approach 3: Tailwind theme extension + migration codemod**  
Register the semantic tokens in the Tailwind theme (via plugin or config) so semantic class names become available, then provide a small codemod or codemod-assisted PRs to migrate existing code. Keep cva but benefit from theme tokens.

*Trade-offs*: Cleanest long-term DX. Highest upfront work and risk of Tailwind version/config churn.

**Recommendation: Approach 2**  
It directly achieves "authoritative source", leverages the excellent existing atomic ratchet, and keeps changes focused and verifiable by the current check infrastructure. We can still emit a small set of legacy aliases for a short transition period if needed.

## Section 2: Architecture, Token-to-CVA Mapping, File Ownership, Contract Extensions

**Token flow (authoritative)**
- Source: `design-tokens/wireline.tokens.json`
- Generator: `scripts/build-design-tokens.mjs` (already produces CSS vars, TS map, extension CSS, Swift, Kotlin)
- Web consumption:
  - `src/styles/tokens.generated.css` (imported by index.css) provides `--wireline-color-*`, `--wireline-radius-*`, `--wireline-font-*`, elevation, motion, interaction tokens.
  - `src/constants/generated-design-tokens.ts` + `brand-colors.ts` for any JS/runtime needs.
- Styling in atoms: keep cva, replace or augment current color/radius values with `var(--wireline-...)` (arbitrary values or extracted CSS custom properties).
- wl- classes in components.css and foundation.css become thin composites or direct re-exports of the new vars.

**Example token-to-CVA mapping (Button)**
Current pattern (simplified):
```tsx
const buttonVariants = cva(
  "relative inline-flex ... rounded-lg ...",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground ...",
      },
    },
  }
);
```

Target pattern:
```tsx
const buttonVariants = cva(
  "relative inline-flex items-center ... rounded-[var(--wireline-radius-md)] ...",
  {
    variants: {
      variant: {
        primary: "bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] ...",
      },
    },
  }
);
```

Similar updates for Card (elevation → surface tokens), Input, Badge, Skeleton (radius), StatusNotice, etc.

For legacy wl-panel etc., either:
- Update their definitions in components.css to use the new --wireline-* vars, or
- Keep thin aliases for one cycle.

**File ownership**
- `design-tokens/wireline.tokens.json`, `scripts/build-design-tokens.mjs`, `scripts/check-design-token-contract.mjs`, `scripts/check-design-system-contract.mjs`, `scripts/check-atomic-design-completion.mjs`: owned by the design system.
- `src/components/atoms/*`, `src/components/molecules/*` (core ones): must conform to the contracts. Changes land via PRs that expand or satisfy the checks.
- shadcn/ wrappers: thin re-exports only — never add new logic.
- Generated files: never edit by hand.
- Documentation: `references/atomic-design.md`, new or expanded `references/design-tokens-usage.md`, README updates.

**Contract extensions (examples to add)**
In `check-design-system-contract.mjs` (or a new dedicated section):
```js
for (const atom of canonicalAtoms) {
  assertIncludes(atom, /--wireline-(color|radius|font)/, "must derive from semantic wireline tokens");
  assertExcludes(atom, /#[0-9a-fA-F]{3,6}/, "no hard-coded hex colors outside tokens");
}
```
Similar asserts for molecules that own styling (Card, StatusNotice).

Add assertions that `brand-colors.ts` covers the core semantic set and that `foundation.css` / `components.css` reference the generated vars for wl- primitives.

Update `check-atomic-design-completion.mjs` with new canonical expectations for token usage.

**Native & extension parity**
- The generator already emits the files added in the recent pull. The plan ensures the consuming theme files (WirelineTheme.swift, WirelineDesignTokens.kt, extension panel styles) stay in sync and that any manual overrides are removed in favor of the generated values.
- Web extension: ensure `apps/browser-extension/panel/tokens.generated.css` is imported and used in its panel styles.

## Section 3: Migration, Documentation, Examples

**Migration guidance**
- Prefer using the canonical atoms/molecules.
- For one-off styling, use the `--wireline-*` vars (or the short aliases during transition).
- Document "before/after" in the usage guide.
- Provide a small set of search/replace patterns or a one-time migration PR for the most common hard-coded values.

**Documentation**
- Update `references/atomic-design.md` to show the tokens layer as the base of atoms.
- Add `references/design-tokens-usage.md` with:
  - How to read the JSON
  - Using vars in atoms and CSS
  - When to use the TS map
  - Cross-surface notes
- Add examples in the doc for Button, Card, a form field.

**Example migration**
- Migrate one high-visibility, low-risk component (e.g. a page or a molecule like MetricCard or SearchField) as part of the plan to prove the pattern and update the contracts.

## Section 4: Verification, Risks, Rollout

**Verification**
- All changes must keep `npm run verify` and the specific contract scripts green.
- Add or expand token-usage assertions in the existing check scripts.
- No new visual contracts or screenshot baselines (per CODEBASE_HEALTH.md).

**Risks & mitigations**
- Risk: widespread atom changes break many files. Mitigation: small, focused PRs + contracts catch drift early. Update a few pages as part of the plan.
- Risk: native parity drift. Mitigation: generator is the source; the plan includes verification that consuming code uses the generated artifacts.
- Risk: designer handoff. Mitigation: document the JSON + generated artifacts; Figma sync is out of scope for this cycle.

**Rollout**
- Do core atoms + contracts first.
- Then one or two example pages/components.
- Then documentation.
- Ship behind the existing verify gate.

## Self-Review
- No placeholders or TBDs.
- Internal consistency: architecture matches goals and scope.
- Scope is focused for a single implementation cycle.
- Ambiguities resolved (e.g., how legacy wl- names are handled during transition).
- All requirements from Section 1 have corresponding coverage in later sections.

Spec complete.

## PR Plan

### PR 1: Establish token → styling mapping and update base layers
**Description:** Make the generated --wireline-* vars the source for radius, colors, and surfaces. Update components.css, foundation.css, and brand-colors.ts (as needed) to derive or alias from the new tokens. Add basic token usage assertions to contracts.

**Files/components affected:** design-tokens/wireline.tokens.json (if needed), scripts/build-design-tokens.mjs (if aliases needed), src/styles/components.css, src/styles/foundation.css, src/constants/brand-colors.ts, scripts/check-design-system-contract.mjs, scripts/check-design-token-contract.mjs

**Dependencies:** None

### PR 2: Update core canonical atoms to derive from semantic tokens
**Description:** Modify Button, Card, Input family, Badge, Skeleton, StatusNotice/feedback atoms to use --wireline-* vars inside cva definitions and class strings. Keep cva + data-slot + shadcn re-export pattern.

**Files/components affected:** src/components/atoms/Button.tsx, src/components/atoms/Card.tsx (if molecule), src/components/atoms/Input.tsx, src/components/atoms/Badge.tsx, src/components/atoms/Skeleton.tsx, src/components/atoms/StatusNotice.tsx (and related), src/components/ui/shadcn/* (thin updates only)

**Dependencies:** PR 1

### PR 3: Strengthen contracts and atomic checks for token usage
**Description:** Expand the check scripts with explicit requirements for token-derived values, no hard-coded hex outside tokens, and proper var usage in atoms/molecules. Ensure the checks run in verify.

**Files/components affected:** scripts/check-design-system-contract.mjs, scripts/check-atomic-design-completion.mjs, package.json scripts if needed

**Dependencies:** PR 1, PR 2

### PR 4: Extension parity, documentation, and example migration
**Description:** Ensure browser extension panel uses the generated tokens. Add usage documentation. Perform one concrete example migration of a page or molecule to the new pattern and update contracts if needed. Verify native generated artifacts are consumed cleanly.

**Files/components affected:** apps/browser-extension/panel/* (styles, tokens), references/atomic-design.md, references/design-tokens-usage.md (new), one example page or molecule (e.g. a settings or actions component), ios/android theme files (verification only)

**Dependencies:** PR 2, PR 3

## Next Steps
Once approved, write the implementation plan and execute via `/execute-plan` on this document (or the derived plan file).

Spec written to the path below (in actual execution).
