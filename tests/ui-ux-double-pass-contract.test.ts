import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("UI/UX double-pass system contract", () => {
  it("registers the second-pass layer at the semantic-system boundary", () => {
    const index = read("src/index.css");
    const hardening = index.indexOf('@import "./styles/system-hardening.css";');
    const refinement = index.indexOf('@import "./styles/system-refinement-pass-two.css";');
    const responsive = index.indexOf('@import "./styles/responsive.css";');

    expect(hardening).toBeGreaterThan(-1);
    expect(refinement).toBeGreaterThan(hardening);
    expect(responsive).toBeGreaterThan(refinement);
  });

  it("keeps native controls synchronized with the resolved Wireline theme", () => {
    const css = read("src/styles/system-refinement-pass-two.css");

    expect(css).toContain(":root {\n  color-scheme: dark;");
    expect(css).toContain("html.light {\n  color-scheme: light;");
    expect(css).toContain("accent-color: var(--wireline-color-action-primary-default)");
  });

  it("hardens custom PageShell tabs and mobile actions", () => {
    const css = read("src/styles/system-refinement-pass-two.css");

    expect(css).toContain('[role="tablist"].tab-strip-scroll');
    expect(css).toContain("overscroll-behavior-inline: contain");
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain('.wl-ui-caps button[aria-label="Page actions"]');
    expect(css).toContain("--wireline-interaction-target-comfortable, 44px");
    expect(css).toContain('[role="dialog"][aria-label="Page actions"]');
    expect(css).toContain("max-height: calc(100dvh");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain("var(--wireline-color-overlay-scrim)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });

  it("does not animate every CSS property on stable shared surfaces", () => {
    const design = read("src/lib/wireline-design-system.ts");

    for (const key of [
      "settingsPanel",
      "settingsRow",
      "statusSuccess",
      "modalSurface",
      "panelFrame",
      "insightStatCard",
      "banner",
      "directorBubble",
      "accountHolderBubble",
      "proposalCard",
      "starterChip",
      "composerToolChip",
      "composerSendBtn",
      "capabilityCatPill",
      "scrollToBottom",
    ]) {
      const match = design.match(new RegExp(`${key}:[\\s\\S]*?(?=\\n  [a-zA-Z]|\\n} as const)`));
      expect(match?.[0], `${key} should remain in the shared contract`).toBeTruthy();
      expect(match?.[0], `${key} should use a bounded transition`).not.toContain("transition-all");
    }
  });

  it("protects generated and customer-provided content from widening route shells", () => {
    const css = read("src/styles/system-refinement-pass-two.css");

    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain(":where(input, select, textarea) {\n  min-width: 0;");
    expect(css).toContain("textarea:not([data-resize=\"none\"])");
    expect(css).toContain("resize: block");
  });
});
