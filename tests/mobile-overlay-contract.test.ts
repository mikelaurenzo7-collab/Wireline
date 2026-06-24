import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("canonical mobile overlay system", () => {
  it("keeps the drawer as a named Dialog presentation with safe mobile geometry", () => {
    const dialog = source("src/components/atoms/Dialog.tsx");

    expect(dialog).toContain("drawer:");
    expect(dialog).toContain("max-h-[min(70dvh,40rem)]");
    expect(dialog).toContain("safe-area-inset-bottom");
    expect(dialog).toContain("slide-in-from-bottom-0");
    expect(dialog).toContain("DialogPortal");
  });

  it("keeps ClientToolbar on canonical Button and Dialog primitives", () => {
    const toolbar = source("src/components/layout/ClientToolbar.tsx");

    expect(toolbar).toContain("DialogContent");
    expect(toolbar).toContain("DialogTrigger");
    expect(toolbar).toContain("DialogClose");
    expect(toolbar).toContain("Button,");
    expect(toolbar).toContain('presentation="drawer"');
    expect(toolbar).toContain('id="wireline-toolbar-actions"');
    expect(toolbar).not.toContain("window.addEventListener");
    expect(toolbar).not.toContain("fixed inset-0 z-[80]");
    expect(toolbar).not.toContain("ShadButton");
  });

  it("documents the intended public navigation and workspace action split", () => {
    const plan = source("references/design-system-navigation-plan.md");

    expect(plan).toContain("Mobile marketing navigation");
    expect(plan).toContain("Mobile workspace actions");
    expect(plan).toContain("Delegate Escape, focus trapping, focus restoration, and body scroll locking to Radix.");
  });
});
