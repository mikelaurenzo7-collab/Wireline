import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const outputs = {
  extension: "apps/browser-extension/panel/tokens.generated.css",
  swift: "ios/Wireline/Theme/WirelineDesignTokens.generated.swift",
  kotlin: "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
};

describe("cross-surface design token generation", () => {
  it("targets the active web, extension, iOS, and Android surfaces", () => {
    const source = read("scripts/build-design-tokens.mjs");

    expect(source).toContain("src/styles/tokens.generated.css");
    expect(source).toContain(outputs.extension);
    expect(source).toContain(outputs.swift);
    expect(source).toContain(outputs.kotlin);
  });

  it("keeps generated native and extension artifacts present and semantically aligned", () => {
    for (const output of Object.values(outputs)) expect(existsSync(resolve(root, output))).toBe(true);

    const extension = read(outputs.extension);
    const swift = read(outputs.swift);
    const kotlin = read(outputs.kotlin);

    expect(extension).toContain("--wireline-color-canvas-default: #F8F9FF;");
    expect(extension).toContain("--wireline-interaction-target-comfortable: 44px;");
    expect(swift).toContain("WirelineDesignTokens");
    expect(swift).toContain("colorActionPrimaryDefault");
    expect(kotlin).toContain("WirelineDesignTokens");
    expect(kotlin).toContain("colorActionPrimaryDefault");
  });

  it("loads generated extension tokens before panel-specific styling", () => {
    const panel = read("apps/browser-extension/panel/index.html");
    expect(panel.indexOf("./tokens.generated.css")).toBeLessThan(panel.indexOf("./styles.css"));
  });
});
