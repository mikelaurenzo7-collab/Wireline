import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
});
