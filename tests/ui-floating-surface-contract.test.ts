import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Wireline floating surface design contract", () => {
  it("loads the modal hierarchy after responsive cleanup so it is the final modal authority", () => {
    const indexCss = read("src/index.css");
    const responsive = indexCss.indexOf('@import "./styles/ruthless-mobile-cleanup.css"');
    const modalHierarchy = indexCss.indexOf('@import "./styles/modal-hierarchy.css"');

    expect(responsive).toBeGreaterThanOrEqual(0);
    expect(modalHierarchy).toBeGreaterThan(responsive);
  });

  it("keeps both dialog primitives left-aligned, viewport-contained, and scroll-safe", () => {
    for (const path of ["src/components/atoms/Dialog.tsx", "src/components/ui/shadcn/Dialog.tsx"]) {
      const dialog = read(path);
      expect(dialog, path).toContain('data-slot="dialog-content"');
      expect(dialog, path).toContain("w-[calc(100vw-2rem)]");
      expect(dialog, path).toContain("max-h-[calc(100dvh-2rem)]");
      expect(dialog, path).toContain("overflow-y-auto");
      expect(dialog, path).toContain("overscroll-contain");
      expect(dialog, path).toContain('data-slot="dialog-header"');
      expect(dialog, path).toContain("text-left");
      expect(dialog, path).not.toContain("text-center sm:text-left");
    }
  });

  it("keeps dialog and sheet close controls at the 44px floor with a fully clear title lane", () => {
    for (const path of [
      "src/components/atoms/Dialog.tsx",
      "src/components/ui/shadcn/Dialog.tsx",
      "src/components/ui/shadcn/Sheet.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("grid size-11 place-items-center");
      expect(source, path).not.toContain("grid size-9 place-items-center");
      expect(source, path).toContain("break-words pr-14 text-left");
      expect(source, path).toContain("text-[15px] leading-6");
    }
  });

  it("keeps custom product dialogs at the same 44px close-target floor", () => {
    const postCreate = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const trialGate = read("src/components/TrialGateModal.tsx");
    const blueprintCss = read("src/styles/phone-agent-blueprint.css");

    expect(postCreate).toContain("grid size-11 shrink-0 place-items-center");
    expect(postCreate).not.toContain("grid size-9 shrink-0 place-items-center");
    expect(trialGate).toContain("h-11 w-11");
    expect(trialGate).not.toContain("after:hidden sm:h-9 sm:w-9");
    expect(blueprintCss).toMatch(/\.studio-blueprint-close\s*\{[^}]*width:\s*44px;/);
    expect(blueprintCss).toMatch(/\.studio-blueprint-close\s*\{[^}]*height:\s*44px;/);
  });

  it("does not force the Studio blueprint into the shared inset-modal mobile geometry", () => {
    const modalCss = read("src/styles/modal-hierarchy.css");
    const mobileBlock = modalCss.slice(modalCss.indexOf("@media (max-width: 639px)"));
    expect(mobileBlock).not.toContain(".studio-blueprint-dialog");
  });

  it("normalizes custom popup titles so page-scale typography cannot leak into dialogs", () => {
    const modalCss = read("src/styles/modal-hierarchy.css");

    for (const id of [
      "trial-gate-title",
      "deploy-agent-title",
      "create-agent-title",
      "post-create-wizard-title",
      "team-invite-title",
      "phone-agent-blueprint-title",
    ]) {
      expect(modalCss).toContain(`#${id}`);
    }

    expect(modalCss).toContain("--wireline-modal-title-size");
    expect(modalCss).toContain("font-style: normal !important");
    expect(modalCss).toContain("overflow-wrap: anywhere");
  });

  it("keeps confirmation dialogs contained and visually subordinate to page headings", () => {
    const alertDialog = read("src/components/ui/shadcn/AlertDialog.tsx");

    expect(alertDialog).toContain('data-slot="alert-dialog-content"');
    expect(alertDialog).toContain("w-[calc(100vw-2rem)]");
    expect(alertDialog).toContain("max-h-[calc(100dvh-2rem)]");
    expect(alertDialog).toContain("overflow-y-auto overscroll-contain");
    expect(alertDialog).toContain('data-slot="alert-dialog-header"');
    expect(alertDialog).toContain("text-left");
    expect(alertDialog).not.toContain("text-center sm:text-left");
    expect(alertDialog).not.toContain("font-display italic");
  });

  it("keeps menus and selects inside narrow viewports", () => {
    // The menu contract lives on the canonical atom. A second, uncontained
    // menu under `ui/shadcn` is what let narrow-viewport clipping regress
    // before, so the duplicate must not come back alongside it.
    const menu = read("src/components/atoms/DropdownMenu.tsx");
    const select = read("src/components/ui/shadcn/Select.tsx");

    for (const source of [menu, select]) {
      expect(source).toContain("collisionPadding={12}");
      expect(source).toContain("max-h-[min(70dvh");
      expect(source).toContain("text-left");
      expect(source).toContain("wireline-elevation-md");
      expect(source).toContain("max-w-[calc(100vw-1.5rem)]");
    }

    // Select scrolls through its own Radix viewport buttons; the menu scrolls
    // its content directly, so only the menu needs scroll containment.
    expect(menu).toContain("overflow-y-auto overscroll-contain");

    expect(existsSync(resolve(process.cwd(), "src/components/ui/shadcn/DropdownMenu.tsx"))).toBe(
      false,
    );
    expect(existsSync(resolve(process.cwd(), "src/components/ui/shadcn/Popover.tsx"))).toBe(false);
  });

  it("portals tooltips so workspace overflow cannot clip contextual help", () => {
    const tooltip = read("src/components/ui/shadcn/Tooltip.tsx");

    expect(tooltip).toContain("TooltipPrimitive.Portal");
    expect(tooltip).toContain("<TooltipPortal>");
    expect(tooltip).toContain("collisionPadding={12}");
    expect(tooltip).toContain("max-w-[min(18rem,calc(100vw-1.5rem))]");
    expect(tooltip).toContain("text-left");
    expect(tooltip).toContain("wireline-elevation-md");
  });

  it("keeps sheets calm, left-aligned, and fully usable on narrow screens", () => {
    const sheet = read("src/components/ui/shadcn/Sheet.tsx");

    expect(sheet).toContain('data-slot="sheet-content"');
    expect(sheet).toContain("overflow-y-auto overscroll-contain");
    expect(sheet).toContain("w-[min(88vw,24rem)]");
    expect(sheet).toContain("max-h-[85dvh]");
    expect(sheet).toContain("duration-200");
    expect(sheet).not.toContain("cubic-bezier(0.34,1.56,0.64,1)");
    expect(sheet).not.toContain("text-center sm:text-left");
    expect(sheet).toContain('data-slot="sheet-header"');
    expect(sheet).toContain("text-left");
  });

  it("keeps shared section headings and actions from competing on narrow screens", () => {
    const sectionHeader = read("src/components/ui/SectionHeader.tsx");

    expect(sectionHeader).toContain("flex min-w-0 flex-col gap-3 sm:flex-row");
    expect(sectionHeader).toContain("min-w-0 flex-1");
    expect(sectionHeader).toContain("max-w-full break-words text-balance");
    expect(sectionHeader).toContain("break-words text-pretty");
    expect(sectionHeader).toContain("[&>*]:w-full sm:w-auto sm:[&>*]:w-auto");
  });

  it("keeps status copy readable while actions stack below it on narrow screens", () => {
    const statusNotice = read("src/components/molecules/StatusNotice.tsx");
    expect(statusNotice).toContain("flex min-w-0 flex-col gap-3 sm:flex-row");
    expect(statusNotice).toContain("min-w-0 flex-1 break-words");
    expect(statusNotice).toContain("max-w-prose break-words leading-5");
    expect(statusNotice).toContain("w-full min-w-0 pl-7");
    expect(statusNotice).toContain("sm:w-auto sm:shrink-0 sm:pl-0");
  });
});
