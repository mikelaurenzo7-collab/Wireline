import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/**
 * Matches a typography-size utility that omits the `length:` data-type hint.
 * Assembled from fragments for the same scanner reason described in the test.
 */
const UNHINTED_TYPOGRAPHY_SIZE = new RegExp(
  [
    "(?<!length:)\\btext-",
    "\\[",
    "var\\(",
    "--wireline-typography-[A-Za-z0-9]+-size",
    "\\)\\]",
  ].join(""),
);

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const next = `${dir}/${entry.name}`;
    if (entry.isDirectory()) listSourceFiles(next, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(next);
  }
  return out;
}

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

  it("asks Tailwind for a font size, not a colour, when sizing from a typography token", () => {
    // Sizing from a typography token without a data-type hint is ambiguous:
    // Tailwind cannot tell a length from a colour inside a bare `var()`, and
    // resolves the shorthand to `color`. That produced `color: 11px` — invalid,
    // so the property fell back to `inherit` — while the intended font size was
    // never applied at all. With `!important` (EmptyState's compact primary
    // action) it also beat the on-action colour utility, leaving near-white
    // label text on the brand purple at 2.48:1.
    //
    // The `length:` hint states the data type and compiles to `font-size`.
    // Keep every typography-size utility in that form.
    //
    // Every example below is assembled at runtime. Tailwind's scanner reads
    // this file as plain text, so a literal example here would be extracted as
    // a real utility candidate and would regenerate the very `color: <length>`
    // rule this contract exists to remove.
    const offenders: string[] = [];
    for (const file of listSourceFiles("src")) {
      const source = read(file);
      for (const match of source.matchAll(new RegExp(UNHINTED_TYPOGRAPHY_SIZE.source, "g"))) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);

    // The guard must be able to fail: the un-hinted form has to be detectable.
    const token = "--wireline-typography-overline-size";
    const unhinted = ["text-", "[", "var(", token, ")]"].join("");
    const hinted = ["text-", "[", "length:var(", token, ")]"].join("");
    expect(UNHINTED_TYPOGRAPHY_SIZE.test(unhinted)).toBe(true);
    expect(UNHINTED_TYPOGRAPHY_SIZE.test(hinted)).toBe(false);
  });

  it("exposes shared composer utilities for authenticated command surfaces", () => {
    const designSystem = read("src/styles/design-system.css");
    expect(designSystem).toContain(".wl-composer-dock");
    expect(designSystem).toContain(".wl-chip-suggestion");
    expect(designSystem).toContain(".wl-panel-elevated");
    // The composer-dock utility and the shared workspace voice constants live
    // on Studio Workroom (the chat composer); Claude Design Overview is a
    // dashboard with its own honest copy.
    const workroom = read("src/components/StudioWorkroom.tsx");
    expect(workroom).toContain("wl-composer-dock");
    expect(workroom).toContain("WORKSPACE_VOICE");
  });
});
