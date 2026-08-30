import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
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

    expect(onboarding).toContain('const CREATE_DESTINATION = "/studio?create=1"');
    expect(onboarding).toContain('workspace_model: "one_workspace"');
    expect(onboarding).not.toContain("posture=");
    expect(onboarding).not.toContain("readStoredWorkspaceMode");
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

  it("ships one production phone-Bot artwork source across every brand surface", () => {
    const mark = source("src/components/brand/BotBoundMark.tsx");
    const legacyMark = source("src/components/brand/WirelineMark.tsx");
    const renderer = source("scripts/render-image-assets.mjs");

    expect(mark).toContain('src="/brand/botbound-operator-polished.png"');
    expect(mark).toContain('data-botbound-mark="phone-bot"');
    expect(mark).not.toContain("<svg");
    expect(legacyMark).toContain('from "./BotBoundMark"');
    expect(renderer).toContain("public/brand/botbound-app-icon.png");

    for (const asset of [
      "public/favicon.svg",
      "public/wireline-icon.svg",
      "public/wireline-chatgpt-app-icon.svg",
      "scripts/apple-touch-icon.svg",
      "scripts/ios-app-icon.svg",
    ]) {
      const svg = source(asset);
      expect(svg, `${asset} must wrap the production robot artwork`).toContain(
        "botbound-app-icon.png",
      );
      expect(svg).not.toContain("folded violet and platinum W");
    }

    const android = source("android/app/src/main/res/drawable/ic_launcher_foreground.xml");
    expect(android).toContain("@drawable/botbound_launcher_foreground");
  });

  it("keeps the retired folded-W geometry out of the customer identity", () => {
    const retiredPaths = [
      "M76 14H100L132 106H108Z",
      "M14 14H40L68 106H42Z",
      "M42 106H68L100 14H74Z",
      "M108 106H134L166 14H140Z",
    ];
    const customerAssets = [
      "src/components/brand/BotBoundMark.tsx",
      "public/favicon.svg",
      "public/botbound-icon.svg",
      "public/wireline-icon.svg",
      "public/wireline-chatgpt-app-icon.svg",
      "scripts/apple-touch-icon.svg",
      "scripts/ios-app-icon.svg",
    ];
    for (const asset of customerAssets) {
      for (const path of retiredPaths) expect(source(asset), asset).not.toContain(path);
    }
  });

  it("keeps the control radius reset in @layer base so rounded-* utilities win", () => {
    const foundation = source("src/styles/foundation.css");
    expect(foundation).toMatch(
      /@layer base \{\s*button,\s*input,\s*select,\s*textarea \{[^}]*border-radius: var\(--radius\);/,
    );
  });
});
