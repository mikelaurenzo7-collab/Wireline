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

const pxNumber = (value: string | number) => String(value).match(/^(\d+(?:\.\d+)?)px$/)?.[1];
const camel = (path: string) =>
  path
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());

describe("Wireline design token pipeline", () => {
  it("keeps DTCG source, generated CSS, and TypeScript values synchronized", () => {
    const tokenSource = JSON.parse(source("design-tokens/wireline.tokens.json")) as TokenGroup;
    const css = source("src/styles/tokens.generated.css");
    const typescript = source("src/constants/generated-design-tokens.ts");
    const values = flatten(tokenSource);

    expect(values["color.canvas.default"]).toBe("#0A0A0E");
    expect(values["color.action.primary.default"]).toBe("#A78BFA");
    expect(values["color.action.primary.pressed"]).toBe("#8B5CF6");
    expect(values["color.text.primary"]).toBe("#F5F4F8");

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

  it("emits the press/lift motion scalars to native from the token source, not a hardcoded literal", () => {
    // Regression guard: the Swift/Kotlin generators previously hardcoded
    // pressScale = 0.98 while the token source defined 0.985, so iOS/Android
    // press feedback silently drifted from the web. The generator must now
    // read motion.press and motion.lift from the single source of truth.
    const tokenSource = JSON.parse(source("design-tokens/wireline.tokens.json")) as TokenGroup;
    const values = flatten(tokenSource);
    const pressScale = values["motion.press"];
    const liftPx = pxNumber(values["motion.lift"]);

    expect(pressScale).toBe(0.985);
    expect(liftPx).toBe("1");

    const iosTokens = source("ios/Wireline/Theme/WirelineDesignTokens.generated.swift");
    const iosSharedTokens = source("ios/WirelineShared/WirelineDesignTokens.generated.swift");
    const kotlinTokens = source(
      "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
    );

    expect(iosTokens).toContain(`public static let pressScale: CGFloat = ${pressScale}`);
    expect(iosTokens).toContain(`public static let liftPx: CGFloat = ${liftPx}`);
    expect(iosSharedTokens).toContain(`public static let pressScale: CGFloat = ${pressScale}`);
    expect(kotlinTokens).toContain(`const val pressScale = ${pressScale}f`);
    expect(kotlinTokens).toContain(`const val liftPx = ${liftPx}`);
    // The stale hardcoded literal must never return. Word boundaries avoid
    // false positives from `0.985` or the pressHighlight color channel.
    expect(iosTokens).not.toMatch(/pressScale: CGFloat = 0\.98\b/);
    expect(kotlinTokens).not.toMatch(/pressScale = 0\.98f\b/);
  });

  it("keeps native typography and touch metrics synchronized with the token source", () => {
    const tokenSource = JSON.parse(source("design-tokens/wireline.tokens.json")) as TokenGroup;
    const values = flatten(tokenSource);
    const iosTokens = source("ios/Wireline/Theme/WirelineDesignTokens.generated.swift");
    const iosSharedTokens = source("ios/WirelineShared/WirelineDesignTokens.generated.swift");
    const kotlinTokens = source(
      "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
    );
    const metricPaths = [
      "interaction.target.minimum",
      "interaction.target.comfortable",
      "interaction.target.primary",
      "typography.display.size",
      "typography.display.lineHeight",
      "typography.h1.size",
      "typography.h1.lineHeight",
      "typography.h2.size",
      "typography.h2.lineHeight",
      "typography.h3.size",
      "typography.h3.lineHeight",
      "typography.body.size",
      "typography.body.lineHeight",
      "typography.bodyStrong.size",
      "typography.bodyStrong.lineHeight",
      "typography.caption.size",
      "typography.caption.lineHeight",
      "typography.overline.size",
      "typography.overline.lineHeight",
    ];

    for (const path of metricPaths) {
      const metricName = camel(path);
      const px = pxNumber(values[path]);
      expect(px, `${path} should be a px token`).toBeTruthy();
      expect(iosTokens).toContain(`public static let ${metricName}: CGFloat = ${px}`);
      expect(iosSharedTokens).toContain(`public static let ${metricName}: CGFloat = ${px}`);
      // Compose is the one surface that distinguishes the two kinds of
      // measurement CSS and CGFloat collapse into one number. Type sizes and
      // line heights must be TextUnit (`sp`) so they follow the reader's system
      // font-size setting; spacing, radii, and hit targets stay Dp. Emitting the
      // whole group as `.dp` is not a style nit — `.sp` has no Dp receiver, so
      // every consumer of a typography token failed to compile and the Android
      // app could not be built at all.
      const unit = path.startsWith("typography.") ? "sp" : "dp";
      expect(kotlinTokens).toContain(`val ${metricName} = ${px}.${unit}`);
    }

    // Guard the split itself, not just these paths: no typography token may be
    // emitted as a Dp, and the generator has to import both units.
    expect(kotlinTokens).not.toMatch(/val typography[A-Za-z0-9]+ = [\d.]+\.dp/);
    expect(kotlinTokens).toContain("import androidx.compose.ui.unit.sp");
    expect(kotlinTokens).toContain("import androidx.compose.ui.unit.dp");

    expect(values["interaction.target.minimum"]).toBe("40px");
    expect(iosTokens).not.toContain("interactionTargetMinimum: CGFloat = 24");
    expect(kotlinTokens).not.toContain("interactionTargetMinimum = 24.dp");
  });

  it("ships the new surface.raised and elevation.raised tokens to every surface", () => {
    const css = source("src/styles/tokens.generated.css");
    const extensionCss = source("apps/browser-extension/panel/tokens.generated.css");
    const typescript = source("src/constants/generated-design-tokens.ts");
    expect(css).toContain("--wireline-color-surface-raised: #201E29");
    expect(css).toContain("--wireline-elevation-raised:");
    expect(extensionCss).toContain("--wireline-color-surface-raised: #201E29");
    expect(extensionCss).toContain("--wireline-elevation-raised:");
    expect(typescript).toContain('"color.surface.raised": "#201E29"');
    expect(typescript).toContain('"elevation.raised"');
  });

  it("redirects raw Tailwind rose/amber status utilities to the Wireline status tokens", () => {
    // The @theme inline block in index.css must redirect rose-* and amber-*
    // to the Wireline error/warning tokens so 300+ raw utility usages across
    // 8+ components all resolve to the canonical Wireline status colors
    // without touching a single component file. Regression guard: if anyone
    // removes these redirects, error/danger/warning surfaces revert to
    // Tailwind's generic rose/amber ramp and break the dark Letterpress system.
    const indexCss = source("src/index.css");
    expect(indexCss).toContain("--color-rose-500: var(--wireline-color-status-error)");
    expect(indexCss).toContain("--color-rose-600: var(--wireline-color-status-error)");
    expect(indexCss).toContain("--color-amber-500: var(--wireline-color-status-warning)");
    expect(indexCss).toContain("--color-amber-600: var(--wireline-color-status-warning)");
  });

  it("keeps the global hardening layer scoped to intentional UI surfaces", () => {
    const hardeningCss = source("src/styles/system-hardening.css");
    expect(hardeningCss).toContain(":is(.marketing-surface, .prose, .wl-copy");
    expect(hardeningCss).toContain(".wl-compact-control");
    expect(hardeningCss).not.toContain("p,\nli,\ndd,\ndt,\nsummary,");
    expect(hardeningCss).not.toContain('button,\n[role="button"],\na[role="button"],\ninput,');
  });
});
