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
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => source(file).includes('type="checkbox"'))
      .sort();

    expect(declarations).toEqual(["src/components/ui/shadcn/Checkbox.tsx"]);
  });

  it("keeps the checkbox checked state in CSS, out of reach of cn()", () => {
    const checkbox = source("src/components/ui/shadcn/Checkbox.tsx");
    const components = source("src/styles/components.css");

    // Comments are stripped before asserting on the component. The doc comment
    // names `[data-slot="checkbox"]` to explain the CSS companion, so a bare
    // `toContain` matched that prose even with the real attribute deleted --
    // confirmed by deleting it and watching this test still pass.
    const code = checkbox.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).toMatch(/^\s*data-slot="checkbox"$/m);

    // The fill and tick must live in CSS. Inline, the tick's SVG data URI
    // carried literal spaces; `cn()` splits its argument on whitespace before
    // tailwind-merge runs, so one class became fifteen garbage tokens and
    // `checked:bg-primary` was dropped as a background conflict — a checked box
    // rendered with no fill and no tick. `[^}]` keeps each match inside its own
    // rule block; `[\s\S]` would run past the closing brace and be satisfied by
    // a later rule.
    expect(components).toMatch(/\[data-slot="checkbox"\]:checked\s*\{[^}]*?background-image:/);
    expect(components).toMatch(/\[data-slot="checkbox"\]:checked\s*\{[^}]*?background-color:/);

    // Guard the shape of the hazard, not just this one instance: no Tailwind
    // arbitrary value in the primitive may contain a literal space.
    const arbitraryWithSpace = /\b[a-z-]+(?::[a-z-]+)*-\[[^\]]* [^\]]*\]/;
    expect(code).not.toMatch(arbitraryWithSpace);
  });

  it("draws the brand mark once, and ships that exact geometry everywhere", () => {
    // The glyph used to exist twice — the canonical component and a legacy copy
    // under components/ — so a redesign had to be applied in two places or the
    // brand silently forked. The legacy copy is gone; keep it that way.
    const mark = source("src/components/brand/WirelineMark.tsx");
    const path = mark.match(/<path d="([^"]+)"/)?.[1];
    expect(path, "canonical mark path not found").toBeTruthy();

    const drawnBy = globSync("src/**/*.tsx", { cwd: root })
      .map((file) => file.replaceAll("\\", "/"))
      .filter(
        (file) => /<path d="M[\d.]+ [\d.]+/.test(source(file)) && source(file).includes("H44"),
      )
      .sort();
    expect(drawnBy).toEqual(["src/components/brand/WirelineMark.tsx"]);

    // Every shipped icon carries the same path as the component. Favicon, PWA
    // icon, OG card, and the ChatGPT app icon are separate files; without this
    // they drift from the product and each other.
    //
    // `scripts/apple-touch-icon.svg` is in this list because it is a *source*,
    // not an output: `npm run assets` renders it into apple-touch-icon.png and
    // wireline-icon-192.png as a prebuild step. Redrawing the mark and updating
    // only the committed PNGs looked correct until the next build silently
    // regenerated both from this file and restored the old glyph.
    for (const asset of [
      "public/favicon.svg",
      "public/wireline-icon.svg",
      "public/og-image.svg",
      "public/wireline-chatgpt-app-icon.svg",
      "scripts/apple-touch-icon.svg",
    ]) {
      expect(source(asset), `${asset} is not on the canonical glyph`).toContain(path!);
    }

    // Android's adaptive launcher is a vector drawable, so it carries the same
    // geometry in Android's own comma-separated path syntax rather than the
    // SVG spelling. It previously shipped a third, unrelated filled W.
    const androidPath = path!
      .replace(/([\d.])\s+([\d.])/g, "$1,$2")
      .replace(/([A-Z])(\d)/g, "$1$2");
    expect(
      source("android/app/src/main/res/drawable/ic_launcher_foreground.xml"),
      "android launcher is not on the canonical glyph",
    ).toContain(androidPath);
  });

  it("keeps the brand mark square and its stroke scalable", () => {
    const mark = source("src/components/brand/WirelineMark.tsx");

    // Every slot the mark lands in is square — favicon, PWA icon, app icon,
    // avatar. The old 128x96 board letterboxed in all of them.
    expect(mark).toContain('viewBox="0 0 48 48"');

    // `non-scaling-stroke` pins stroke width to screen pixels no matter how
    // small the mark renders, which turned the favicon into a blob. Comments
    // are stripped because the component's own doc names the attribute to
    // explain why it is gone.
    const code = mark.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toContain("non-scaling-stroke");
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
