import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("authenticated responsive polish contract", () => {
  it("keeps the desktop workspace rail reachable on short viewports", () => {
    const css = read("src/styles/workspace-polish.css");

    expect(css).toContain('aside[aria-label="Workspace navigation"]');
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("overscroll-behavior-y: contain");
    expect(css).toContain("@media (min-width: 1024px) and (max-height: 760px)");
  });

  it("keeps workspace controls token-correct in both appearances", () => {
    const css = read("src/styles/workspace-polish.css");

    expect(css).toContain("var(--wireline-color-surface-default) 82%");
    expect(css).toContain("var(--wireline-color-canvas-default)");
    expect(css).not.toContain("black 20%");
  });

  it("stacks authenticated titles and actions through narrow tablet widths", () => {
    const frame = read("src/components/layout/WorkspacePageFrame.tsx");
    const inbox = read("src/pages/EmailPage.tsx");

    expect(frame).toContain("md:flex-row md:items-start md:justify-between");
    expect(frame).toContain("w-full [&>*]:w-full md:w-auto md:[&>*]:w-auto");
    expect(inbox).toMatch(/<WorkspacePageIntro\s+title="Inbox"/);
    expect(inbox).toContain("action={");
    expect(inbox).not.toContain("sm:flex-row sm:items-end sm:justify-between");
  });

  it("gives framed settings rows full-width actions on the smallest phones", () => {
    const css = read("src/styles/workspace-polish.css");

    expect(css).toContain("@media (max-width: 479px)");
    expect(css).toContain(".wl-data-row--framed .wl-data-row__trailing");
    expect(css).toContain("padding-inline-start: 2.75rem");
  });
});
