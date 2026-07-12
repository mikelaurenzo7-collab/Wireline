import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("canonical mobile overlay system", () => {
  it("keeps named Dialog presentations for mobile navigation, drawers, and sidebars", () => {
    const dialog = source("src/components/atoms/Dialog.tsx");

    expect(dialog).toContain("navigation:");
    expect(dialog).toContain("drawer:");
    expect(dialog).toContain("sidebar:");
    expect(dialog).toContain("max-h-[min(70dvh,40rem)]");
    expect(dialog).toContain("safe-area-inset-bottom");
    expect(dialog).toContain("slide-in-from-bottom-0");
    expect(dialog).toContain("slide-in-from-left-0");
    expect(dialog).toContain("DialogPortal");
  });

  it("keeps ClientToolbar and AppPageIntro on canonical Button and Dialog primitives", () => {
    for (const path of [
      "src/components/layout/ClientToolbar.tsx",
      "src/components/layout/AppPageIntro.tsx",
    ]) {
      const component = source(path);

      expect(component).toContain("DialogContent");
      expect(component).toContain("DialogTrigger");
      expect(component).toContain("DialogClose");
      expect(component).toContain("Button,");
      expect(component).toContain('presentation="drawer"');
      expect(component).not.toContain("window.addEventListener");
      expect(component).not.toContain("document.body.style.overflow");
      expect(component).not.toContain("ShadButton");
    }
  });

  it("keeps WorkspaceShell on the canonical desktop rail plus native/mobile utility split", () => {
    const shell = source("src/components/WorkspaceShell.tsx");
    const signature = source("src/styles/wireline-app-signature.css");

    expect(shell).toContain("function DesktopRail");
    // Claude Design mobile chrome: one unified MobileDock + a native-shell gate
    // around MobileBrowserUtilities (which surfaces billing/integrations in the
    // mobile browser but is hidden inside native app shells).
    expect(shell).toContain("function MobileDock");
    expect(shell).toContain("function isNativeAppShell");
    expect(shell).toContain("!nativeAppShell ? <MobileBrowserUtilities />");
    expect(shell).toContain("<MobileDock");
    // Full Claude Design sidebar IA, posture-aware.
    expect(shell).toContain("WORKSPACE_NAV");
    expect(shell).toContain("OPERATE_NAV");
    expect(shell).toContain("MOBILE_PRIMARY_NAV");
    expect(shell).toContain("wl-workspace-frame");
    expect(signature).toContain(".wl-workspace-shell > .wl-workspace-frame");
    expect(signature).not.toContain(".wl-workspace-shell > *");
    expect(shell).not.toContain("document.body.style.overflow");
    expect(shell).not.toContain("window.addEventListener");
  });

  it("documents the intended public navigation and workspace action split", () => {
    const plan = source("references/design-system-navigation-plan.md");

    expect(plan).toContain("Mobile marketing navigation");
    expect(plan).toContain("Mobile page and toolbar actions");
    expect(plan).toContain("Persistent workspace routing");
    expect(plan).toContain(
      "Delegate Escape, focus trapping, focus restoration, and body scroll locking to Radix.",
    );
  });
});
