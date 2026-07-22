import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("authenticated modal lifecycle contract", () => {
  it("restores trigger focus and contains keyboard focus for hand-rolled dialogs", () => {
    const focusTrap = source("src/lib/use-modal-focus-trap.ts");

    expect(focusTrap).toContain("previouslyFocused");
    expect(focusTrap).toContain("document.contains(previouslyFocused)");
    expect(focusTrap).toContain('document.addEventListener("keydown", handleKey, true)');
    expect(focusTrap).toContain('event.key === "Escape"');
    expect(focusTrap).toContain('event.key !== "Tab"');
  });

  it("reference-counts body scroll locks without discarding existing padding", () => {
    const scrollLock = source("src/lib/use-body-scroll-lock.ts");

    expect(scrollLock).toContain("let activeLocks = 0");
    expect(scrollLock).toContain("currentPadding + scrollbarWidth");
    expect(scrollLock).toContain("if (activeLocks > 0 || !snapshot) return");
    expect(scrollLock).toContain("snapshot.body.style.overflow = snapshot.overflow");
    expect(scrollLock).toContain("snapshot.body.style.paddingRight = snapshot.paddingRight");
  });

  it("keeps every custom authenticated modal on the shared lifecycle hooks", () => {
    const customDialogs = [
      "src/components/TrialGateModal.tsx",
      "src/components/DeployAgentModal.tsx",
      "src/components/recipes/RecipeModal.tsx",
      "src/components/CreateAgentDialog.tsx",
      "src/components/onboarding/PostCreateActivationWizard.tsx",
      "src/components/PhoneAgentBlueprint.tsx",
      "src/pages/TeamSettings.tsx",
    ];

    for (const path of customDialogs) {
      const component = source(path);
      expect(component, path).toContain("useBodyScrollLock");
      expect(component, path).toContain("useModalFocusTrap");
      expect(component, path).toContain('role="dialog"');
      expect(component, path).toContain('aria-modal="true"');
      expect(component, path).toContain("aria-labelledby");
    }
  });

  it("does not leave duplicate global Escape listeners in migrated modals", () => {
    for (const path of [
      "src/components/TrialGateModal.tsx",
      "src/components/DeployAgentModal.tsx",
      "src/components/recipes/RecipeModal.tsx",
    ]) {
      const component = source(path);
      expect(component, path).not.toContain('addEventListener("keydown"');
    }
  });
});
