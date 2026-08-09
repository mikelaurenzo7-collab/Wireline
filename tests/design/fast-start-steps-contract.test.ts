import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Fast Start step flow contract", () => {
  const createDialog = read("src/components/CreateAgentDialog.tsx");

  it("keeps create on a single brief-first screen", () => {
    expect(createDialog).toContain("{language.setupPrompt}");
    expect(createDialog).toContain("placeholder={briefPlaceholder}");
    expect(createDialog).toContain('aria-label="Use case"');
    expect(createDialog).toContain('aria-label="Quick briefs"');
    expect(createDialog).toContain("language.createCta");
    expect(createDialog).toContain("Not now");
    expect(createDialog).not.toContain("useState<1 | 2>(1)");
    expect(createDialog).not.toMatch(/Step [12] ·/);
    expect(createDialog).not.toContain("continueToVoice");
  });

  it("opens every composer empty and leaves the writing to the customer", () => {
    // A composer seeded with a real value — not a placeholder — hands the
    // customer a box that already contains our sentence. The first thing they
    // have to do is delete it, and if they do not, we create an agent trained on
    // words they never wrote. Suggested starting points belong in the chips
    // under the field and in the placeholder, both of which survive here.
    expect(createDialog).toMatch(/setBrief\(\s*initialBrief\s*\)/);
    expect(createDialog).not.toMatch(/setBrief\(\s*initialBrief\s*\|\|/);
    // The house sentences are gone rather than merely unreferenced, so no later
    // edit can quietly reintroduce them as a "sensible default".
    expect(createDialog).not.toContain("defaultBrief");
    expect(createDialog).toContain("placeholder={briefPlaceholder}");

    // Submitting an empty composer must not substitute a brief either: with
    // nothing to apply we skip training entirely instead of inventing copy.
    expect(createDialog).toContain("const finalBrief = brief.trim();");
    expect(createDialog).toMatch(/if \(finalBrief\) \{/);

    // Same rule in Studio: the generated greeting is a placeholder, and the
    // field only carries text once a saved greeting loads.
    const studioPanel = read("src/components/StudioAgentWorkspacePanel.tsx");
    expect(studioPanel).toMatch(
      /const \[setupGreeting, setSetupGreeting\] = useState\(\s*""\s*\)/,
    );
    expect(studioPanel).toContain("placeholder={defaultGreeting}");
    expect(studioPanel).not.toMatch(
      /setSetupGreeting\([^)]*\|\|\s*defaultGreeting\)/,
    );
  });

  it("hands off into Studio with the post-create wizard payload", () => {
    expect(createDialog).toContain("stashPostCreateWizard(wizardPayload)");
    expect(createDialog).toContain("onCreated?.(wizardPayload)");
    expect(createDialog).toMatch(
      /navigate\(`\/studio\?agent=\$\{encodeURIComponent\(body\.id\)\}`/,
    );
  });
});
