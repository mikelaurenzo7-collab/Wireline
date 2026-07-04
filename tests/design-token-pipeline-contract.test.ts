import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

type TokenLeaf = { $type: string; $value: string | number };
type TokenGroup = Record<string, TokenLeaf | TokenGroup | string>;

function flatten(
  group: TokenGroup,
  path: string[] = [],
  output: Record<string, string | number> = {},
) {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith("$")) continue;
    const nextPath = [...path, key];
    if (value && typeof value === "object" && "$value" in value) {
      const raw = (value as TokenLeaf).$value;
      // Mirror build-design-tokens.mjs: fontFamily values are emitted quoted
      // so multi-word names survive CSS variable substitution.
      output[nextPath.join(".")] =
        (value as TokenLeaf).$type === "fontFamily" && typeof raw === "string" ? `"${raw}"` : raw;
      continue;
    }
    if (value && typeof value === "object") flatten(value as TokenGroup, nextPath, output);
  }
  return output;
}

describe("Wireline design token pipeline", () => {
  it("keeps DTCG source, generated CSS, and TypeScript values synchronized", () => {
    const tokenSource = JSON.parse(source("design-tokens/wireline.tokens.json")) as TokenGroup;
    const css = source("src/styles/tokens.generated.css");
    const typescript = source("src/constants/generated-design-tokens.ts");
    const values = flatten(tokenSource);

    expect(values["color.canvas.default"]).toBe("#15130F");
    expect(values["color.action.primary.default"]).toBe("#5BA98A");
    expect(values["color.action.primary.pressed"]).toBe("#4B9276");
    expect(values["color.text.primary"]).toBe("#F4F2EC");

    for (const [path, value] of Object.entries(values)) {
      expect(css).toContain(`--wireline-${path.replaceAll(".", "-")}: ${value};`);
      expect(typescript).toContain(`"${path}"`);
    }
  });

  it("loads generated token CSS before the existing design-system runtime", () => {
    const indexCss = source("src/index.css");
    const generatedImport = '@import "./styles/tokens.generated.css";';
    const systemImport = '@import "./styles/design-system.css";';

    expect(indexCss).toContain(generatedImport);
    expect(indexCss.indexOf(generatedImport)).toBeLessThan(indexCss.indexOf(systemImport));
  });

  it("keeps compatibility manifests backed by typed semantic values", () => {
    const manifest = source("src/constants/design-tokens.ts");
    const brand = source("src/constants/brand-colors.ts");

    expect(manifest).toContain("dtcg-json -> css-custom-properties + typed-typescript");
    expect(manifest).toContain("wirelineTokenValues");
    expect(brand).toContain('token["color.action.primary.default"]');
    expect(brand).toContain('token["color.text.primary"]');
  });
});
