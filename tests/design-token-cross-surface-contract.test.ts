import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = () => readFileSync(resolve(process.cwd(), "scripts/build-design-tokens.mjs"), "utf8");

describe("cross-surface design token generation", () => {
  it("generates first-class outputs for web, extension, iOS, and Android", () => {
    const source = script();

    expect(source).toContain("src/styles/tokens.generated.css");
    expect(source).toContain("extension/styles/wireline-tokens.generated.css");
    expect(source).toContain("ios/WirelineDesignTokens/WirelineDesignTokens.swift");
    expect(source).toContain("android/design-tokens/src/main/java/com/wireline/design/WirelineDesignTokens.kt");
  });

  it("keeps native outputs generated from the same DTCG token source", () => {
    const source = script();

    expect(source).toContain("design-tokens/wireline.tokens.json");
    expect(source).toContain("WirelineDesignTokens");
    expect(source).toContain("ColorToken");
    expect(source).toContain("Metric");
  });
});
