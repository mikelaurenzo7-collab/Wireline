import { readFileSync } from "node:fs";
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
    for (const path of [
      "src/components/atoms/Dialog.tsx",
      "src/components/ui/shadcn/Dialog.tsx",
    ]) {
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

  it("keeps popovers, menus, and selects inside narrow viewports", () => {
    const popover = read("src/components/ui/shadcn/Popover.tsx");
    const menu = read("src/components/ui/shadcn/DropdownMenu.tsx");
    const select = read("src/components/ui/shadcn/Select.tsx");

    for (const source of [popover, menu, select]) {
      expect(source).toContain("collisionPadding={12}");
      expect(source).toContain("max-h-[min(70dvh");
      expect(source).toContain("text-left");
      expect(source).toContain("wireline-elevation-md");
    }

    expect(popover).toContain("w-[min(18rem,calc(100vw-1.5rem))]");
    expect(menu).toContain("max-w-[calc(100vw-1.5rem)]");
    expect(select).toContain("max-w-[calc(100vw-1.5rem)]");
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