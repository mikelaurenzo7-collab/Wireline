import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** WCAG 2.x relative luminance for opaque sRGB colors (normal text AA = 4.5:1). */
function luminance(hex: string): number {
  expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
  const [r, g, b] = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => parseInt(part, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

type TokenNode = { $value?: unknown; [key: string]: unknown };

function flattenColors(node: TokenNode, path = "color", output: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$") || typeof value !== "object" || value === null) continue;
    const subpath = `${path}.${key}`;
    const nested = value as TokenNode;
    if (typeof nested.$value === "string" && nested.$value.startsWith("#")) {
      output[subpath] = nested.$value;
    } else {
      flattenColors(nested, subpath, output);
    }
  }
  return output;
}

const tokenSource = JSON.parse(
  readFileSync("design-tokens/wireline.tokens.json", "utf8"),
) as { color: TokenNode };
const dark = flattenColors(tokenSource.color);
const css = readFileSync("src/styles/theme-light.css", "utf8");
const light = { ...dark };

for (const [, name, value] of css.matchAll(
  /--wireline-color-([a-zA-Z-]+):\s*(#[\da-fA-F]{6})\s*;/g,
)) {
  // The light stylesheet uses flattened CSS custom-property keys, while
  // DTCG has nested groups. Convert by looking up each canonical path.
  const path = Object.keys(dark).find(
    (token) => token.replaceAll(".", "-") === `color-${name}`,
  );
  expect(path, `unknown light appearance override ${name}`).toBeDefined();
  light[path!] = value;
}

const normalText = [
  "text.primary",
  "text.secondary",
  "text.tertiary",
  "status.success",
  "status.warning",
  "status.error",
  "status.info",
  "status.neutral",
] as const;

const surfaces = [
  "canvas.default",
  "surface.default",
  "surface.strong",
  "action.primary.containerStrong",
] as const;

describe("BotBound appearance contrast", () => {
  it.each([["Dark", dark], ["Light", light]] as const)(
    "preserves WCAG AA normal-text contrast across %s surfaces",
    (_label, colors) => {
      for (const text of normalText) {
        for (const surface of surfaces) {
          const textColor = colors[`color.${text}`];
          const surfaceColor = colors[`color.${surface}`];
          expect(textColor, text).toBeDefined();
          expect(surfaceColor, surface).toBeDefined();
          expect(
            contrast(textColor, surfaceColor),
            `${text} on ${surface}: ${textColor} against ${surfaceColor}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const state of ["default", "hover", "pressed"]) {
        const action = colors[`color.action.primary.${state}`];
        expect(
          contrast(colors["color.text.onAction"], action),
          `button text on ${state} action`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("keeps highlighted text readable instead of alpha-blending the selection into a surface", () => {
    const master = readFileSync("src/styles/botbound-master-polish.css", "utf8");
    expect(master).toMatch(
      /::selection\s*\{\s*background:\s*var\(--wireline-color-action-primary-default\);\s*color:\s*var\(--wireline-color-text-onAction\);\s*\}/,
    );
  });

  it("exposes the resolved theme to visitors without adding a mobile header control", () => {
    const header = readFileSync("src/components/marketing/PrecisionPublicHeader.tsx", "utf8");
    expect(header).toContain("const { resolvedTheme, toggleTheme } = useTheme();");
    expect(header).toContain('aria-label={`Switch to ${nextTheme} appearance`}');
    expect(header).toContain("md:inline-flex");
    expect(header).toContain("setMobileMenuOpen(false);");
    expect(header).toContain("<span>Use {nextTheme} appearance</span>");

    const auth = readFileSync("src/components/auth/AuthAccessPanel.tsx", "utf8");
    expect(auth).toContain("const { resolvedTheme, toggleTheme } = useTheme();");
    expect(auth).toContain('aria-label={`Switch to ${nextTheme} appearance`}');
    expect(auth).toContain('onClick={toggleTheme}');
    expect(auth).toContain('!embedded ? (');
  });

  it("keeps the three public pricing plan actions on a shared baseline", () => {
    const pricing = readFileSync("src/components/usage-billing/UsagePricingPanel.tsx", "utf8");
    expect(pricing).toContain("flex h-full min-w-0 flex-col rounded-2xl border bg-card");
    expect(pricing).toContain("w-full flex-1 rounded-2xl p-6 pb-2");
  });
});
