import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const outputs = {
  extension: "apps/browser-extension/panel/tokens.generated.css",
  swift: "ios/Wireline/Theme/WirelineDesignTokens.generated.swift",
  swiftShared: "ios/WirelineShared/WirelineDesignTokens.generated.swift",
  kotlin: "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
};

describe("cross-surface design token generation", () => {
  it("targets the active web, extension, iOS, and Android surfaces", () => {
    const source = read("scripts/build-design-tokens.mjs");

    expect(source).toContain("src/styles/tokens.generated.css");
    expect(source).toContain(outputs.extension);
    expect(source).toContain(outputs.swift);
    expect(source).toContain(outputs.kotlin);
    expect(source).toContain(outputs.swiftShared);
  });

  it("keeps generated native and extension artifacts present and semantically aligned", () => {
    for (const output of Object.values(outputs))
      expect(existsSync(resolve(root, output))).toBe(true);

    const extension = read(outputs.extension);
    const swift = read(outputs.swift);
    const kotlin = read(outputs.kotlin);

    expect(extension).toContain("--wireline-color-canvas-default: #0A0A0E;");
    expect(extension).toContain("--wireline-color-action-primary-default: #A78BFA;");
    expect(extension).toContain("--wireline-interaction-target-comfortable: 44px;");
    expect(extension).toContain("--wireline-elevation-card:");
    expect(extension).toContain("--wireline-layout-contentMax: 1152px;");

    const swiftShared = read(outputs.swiftShared);
    expect(swiftShared).toContain("colorTextTertiary");
    expect(swift).toContain("WirelineDesignTokens");
    expect(swift).toContain("colorActionPrimaryDefault");
    expect(kotlin).toContain("WirelineDesignTokens");
    expect(kotlin).toContain("colorActionPrimaryDefault");
  });

  it("aligns iOS widget colors to generated shared tokens", () => {
    const widgetColors = read("ios/WirelineWidgets/WidgetColors.swift");
    expect(widgetColors).toContain("WirelineDesignTokens.ColorToken");
    expect(widgetColors).not.toContain("WirelinePalette");
  });

  it("loads generated extension tokens before panel-specific styling", () => {
    const panel = read("apps/browser-extension/panel/index.html");
    expect(panel.indexOf("./tokens.generated.css")).toBeLessThan(panel.indexOf("./styles.css"));
    const extensionStyles = read("apps/browser-extension/panel/styles.css");
    expect(extensionStyles).toContain("var(--wireline-elevation-card)");
    expect(extensionStyles).toContain("--tertiary: var(--wireline-color-text-tertiary)");
    expect(extensionStyles).toContain(".handoff-form");
  });

  it("exposes shared composer utilities for authenticated command surfaces", () => {
    const designSystem = read("src/styles/design-system.css");
    expect(designSystem).toContain(".wl-composer-dock");
    expect(designSystem).toContain(".wl-chip-suggestion");
    expect(designSystem).toContain(".wl-panel-elevated");
    // Studio Workroom must consume the shared composer class map instead of
    // duplicating the dock/chip class strings locally.
    const workroom = read("src/components/StudioWorkroom.tsx");
    expect(workroom).toContain("WL_COMPOSER_CLASSES");
    expect(workroom).toContain("WL_COMPOSER_CLASSES.composerDock");
    expect(workroom).toContain("WL_COMPOSER_CLASSES.starterChip");
  });
});
