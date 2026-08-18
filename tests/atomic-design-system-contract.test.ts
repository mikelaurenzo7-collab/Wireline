import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const FOLDED_W_PATHS = [
  "M76 14H100L132 106H108Z",
  "M14 14H40L68 106H42Z",
  "M42 106H68L100 14H74Z",
  "M108 106H134L166 14H140Z",
] as const;

describe("Atomic Design completion contract", () => {
  it("keeps Card canonical, variant-driven, and free of a legacy second implementation", () => {
    const card = source("src/components/molecules/Card.tsx");

    expect(card).toContain("cardVariants = cva");
    expect(card).toContain('data-slot="card"');
    expect(card).toContain('data-slot="card-header"');
    expect(card).toContain('data-slot="card-content"');
    expect(existsSync(resolve(root, "src/components/ui/shadcn/Card.tsx"))).toBe(false);
  });

  it("keeps public account flows on canonical primitives and one unified Bot workspace", () => {
    const resetPassword = source("src/pages/ResetPassword.tsx");
    const onboarding = source("src/pages/OnboardingFlow.tsx");
    const developers = source("src/pages/Developers.tsx");

    expect(resetPassword).toContain('from "../components/atoms"');
    expect(resetPassword).toContain("FormField, StatusNotice");
    expect(resetPassword).not.toContain("components/ui/shadcn");

    expect(onboarding).toContain('from "../lib/auth-redirect"');
    expect(onboarding).toContain('"/studio?create=1"');
    expect(onboarding).not.toContain("posture=business");
    expect(onboarding).toContain('from "../components/TransitionSurface"');
    expect(onboarding).toContain("language.createCta");
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
    const declarations = globSync("src/**/*.tsx", { cwd: root })
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => source(file).includes('type="checkbox"'))
      .sort();

    expect(declarations).toEqual(["src/components/ui/shadcn/Checkbox.tsx"]);
  });

  it("keeps the checkbox checked state in CSS, out of reach of cn()", () => {
    const checkbox = source("src/components/ui/shadcn/Checkbox.tsx");
    const components = source("src/styles/components.css");
    const code = checkbox.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(code).toMatch(/^\s*data-slot="checkbox"$/m);
    expect(components).toMatch(/\[data-slot="checkbox"\]:checked\s*\{[^}]*?background-image:/);
    expect(components).toMatch(/\[data-slot="checkbox"\]:checked\s*\{[^}]*?background-color:/);

    const arbitraryWithSpace = /\b[a-z-]+(?::[a-z-]+)*-\[[^\]]* [^\]]*\]/;
    expect(code).not.toMatch(arbitraryWithSpace);
  });

  it("draws the folded W once and ships the same core geometry everywhere", () => {
    const mark = source("src/components/brand/WirelineMark.tsx");
    for (const path of FOLDED_W_PATHS) expect(mark).toContain(path);

    const drawnBy = globSync("src/**/*.tsx", { cwd: root })
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => FOLDED_W_PATHS.every((path) => source(file).includes(path)))
      .sort();
    expect(drawnBy).toEqual(["src/components/brand/WirelineMark.tsx"]);

    for (const asset of [
      "public/favicon.svg",
      "public/wireline-icon.svg",
      "public/wireline-chatgpt-app-icon.svg",
      "scripts/apple-touch-icon.svg",
      "scripts/ios-app-icon.svg",
    ]) {
      const svg = source(asset);
      for (const path of FOLDED_W_PATHS) {
        expect(svg, `${asset} is not on the canonical folded W`).toContain(path);
      }
      expect(svg).not.toContain("M4 16H11L19 32L24 21L29 32L37 16H44");
    }

    const android = source("android/app/src/main/res/drawable/ic_launcher_foreground.xml");
    for (const path of [
      "M76,14H100L132,106H108Z",
      "M14,14H40L68,106H42Z",
      "M42,106H68L100,14H74Z",
      "M108,106H134L166,14H140Z",
    ]) {
      expect(android, "Android launcher is not on the canonical folded W").toContain(path);
    }
  });

  it("keeps the folded W on its native ribbon artboard without stroke artifacts", () => {
    const mark = source("src/components/brand/WirelineMark.tsx");
    const code = mark.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(mark).toContain('viewBox="0 0 180 120"');
    expect(code).not.toContain("non-scaling-stroke");
    expect(code).not.toContain("<circle");
    expect(code).not.toContain("M4 16H11L19 32L24 21L29 32L37 16H44");
  });

  it("keeps the control radius reset in @layer base so rounded-* utilities win", () => {
    const foundation = source("src/styles/foundation.css");

    expect(foundation).toMatch(
      /@layer base \{\s*button,\s*input,\s*select,\s*textarea \{[^}]*border-radius: var\(--radius\);/,
    );
  });
});
