import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Atomic Design completion contract", () => {
  it("keeps Card canonical, variant-driven, and compatible with legacy imports", () => {
    const card = source("src/components/molecules/Card.tsx");
    const legacyCard = source("src/components/ui/shadcn/Card.tsx");

    expect(card).toContain("cardVariants = cva");
    expect(card).toContain('data-slot="card"');
    expect(card).toContain('data-slot="card-header"');
    expect(card).toContain('data-slot="card-content"');
    expect(legacyCard).toContain('from "../../molecules/Card"');
  });

  it("keeps public account flows on canonical primitives and feedback molecules", () => {
    const resetPassword = source("src/pages/ResetPassword.tsx");
    const onboarding = source("src/pages/OnboardingFlow.tsx");
    const developers = source("src/pages/Developers.tsx");

    expect(resetPassword).toContain('from "../components/atoms"');
    expect(resetPassword).toContain("FormField, StatusNotice");
    expect(resetPassword).not.toContain("components/ui/shadcn");

    expect(onboarding).toContain('from "../lib/auth-redirect"');
    expect(onboarding).toContain(
      'workspaceMode === "business" ? "/studio?create=1&posture=business"',
    );
    expect(onboarding).toContain('from "../components/TransitionSurface"');
    expect(onboarding).toContain("Opening your first ${language.singular}");
    expect(onboarding).not.toContain("components/ui/shadcn");

    expect(developers).toContain('import { Button } from "../components/atoms"');
    expect(developers).not.toContain("ShadButton");
  });

  it("keeps the public molecule and organism barrels complete", () => {
    const molecules = source("src/components/molecules/index.ts");
    const organisms = source("src/components/organisms/index.ts");

    expect(molecules).toContain("CardContent");
    expect(molecules).toContain("cardVariants");
    expect(organisms).toContain("PageShell, Panel, StatTile");
    expect(organisms).toContain("CommandBar");
  });

  it("declares checkboxes in exactly one place", () => {
    // Feature code that hand-rolls `<input type="checkbox">` re-grows the raw
    // control surface the primitive exists to absorb, and each copy re-derives
    // its own sizing and accent — the reason the app shipped a mix of
    // `accent-primary` natives and design-system boxes.
    const declarations = globSync("src/**/*.tsx", { cwd: root })
      .filter((file) => source(file).includes('type="checkbox"'))
      .sort();

    expect(declarations).toEqual(["src/components/ui/shadcn/Checkbox.tsx"]);
  });

  it("keeps the checkbox checked state in CSS, out of reach of cn()", () => {
    const checkbox = source("src/components/ui/shadcn/Checkbox.tsx");
    const components = source("src/styles/components.css");

    expect(checkbox).toContain('data-slot="checkbox"');

    // The fill and tick must live in CSS. Inline, the tick's SVG data URI
    // carried literal spaces; `cn()` splits its argument on whitespace before
    // tailwind-merge runs, so one class became fifteen garbage tokens and
    // `checked:bg-primary` was dropped as a background conflict — a checked box
    // rendered with no fill and no tick.
    expect(components).toMatch(/\[data-slot="checkbox"\]:checked\s*\{[\s\S]*?background-image:/);
    expect(components).toMatch(/\[data-slot="checkbox"\]:checked\s*\{[\s\S]*?background-color:/);

    // Guard the shape of the hazard, not just this one instance: no Tailwind
    // arbitrary value in the primitive may contain a literal space. Comments
    // are stripped first — the doc comment above quotes the broken pattern on
    // purpose, and flagging that would make the explanation unwritable.
    const code = checkbox.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const arbitraryWithSpace = /\b[a-z-]+(?::[a-z-]+)*-\[[^\]]* [^\]]*\]/;
    expect(code).not.toMatch(arbitraryWithSpace);
  });

  it("keeps the control radius reset in @layer base so rounded-* utilities win", () => {
    // Tailwind v4 emits utilities into `@layer utilities`, and unlayered rules
    // outrank every layer regardless of specificity. Unlayered, this reset
    // flattened every `rounded-*` button, input, select, and textarea in the
    // authenticated product to `--radius` — 27 controls measured across
    // /overview, /studio, /settings, and /phone rendered 8px where the code
    // asked for 20px, so fields sat inside cards with visibly tighter corners.
    const foundation = source("src/styles/foundation.css");

    expect(foundation).toMatch(
      /@layer base \{\s*button,\s*input,\s*select,\s*textarea \{[^}]*border-radius: var\(--radius\);/,
    );
  });
});
