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
    ) as [number, number, number];
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
        const secondary = colors[`color.action.secondary.${state}`];
        for (const surface of ["canvas.default", "surface.strong"]) {
          expect(contrast(secondary, colors[`color.${surface}`])).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it("keeps the published token table synchronized with the light and dark sources", () => {
    const designDoc = readFileSync(".superdesign/design-system.md", "utf8");
    const table = designDoc.slice(designDoc.indexOf("## Semantic Token Architecture"));
    const roles = [
      ["Canvas", "canvas.default"],
      ["Default surface", "surface.default"],
      ["Subtle surface", "surface.subtle"],
      ["Raised surface", "surface.raised"],
      ["Primary text", "text.primary"],
      ["Secondary text", "text.secondary"],
      ["Tertiary text", "text.tertiary"],
      ["Primary action", "action.primary.default"],
      ["Text on action", "text.onAction"],
      ["Default border", "border.default"],
      ["Strong border", "border.strong"],
      ["Success", "status.success"],
      ["Warning", "status.warning"],
      ["Error", "status.error"],
      ["Information", "status.info"],
    ] as const;
    for (const [role, name] of roles) {
      const row = table
        .split("\n")
        .map((line) => line.split("|").map((part) => part.trim().replaceAll("`", "")))
        .find((fields) => fields[1] === role);
      expect(row, `missing documented role: ${role}`).toBeDefined();
      expect(row![2].toLowerCase(), `dark ${role}`).toBe(dark[`color.${name}`]);
      expect(row![3].toLowerCase(), `light ${role}`).toBe(light[`color.${name}`]);
    }
  });

  it("keeps high-contrast white light surfaces with a distinguishable strong border", () => {
    expect(light["color.canvas.default"]).toBe("#ffffff");
    expect(light["color.surface.default"]).toBe("#ffffff");
    for (const surface of ["canvas.default", "surface.strong"]) {
      expect(contrast(light["color.border.strong"], light[`color.${surface}`])).toBeGreaterThanOrEqual(3);
    }
    const styles = readFileSync("src/styles/theme-light.css", "utf8");
    expect(styles).toContain(":where(:root.light) .wl-access-panel__field");
    expect(styles).not.toContain("#f7f7f3");
  });

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

  it.each([["Dark", dark], ["Light", light]] as const)(
    "preserves %s feedback and subtle-surface readable copy",
    (_label, colors) => {
      for (const status of ["success", "warning", "error", "info", "neutral"] as const) {
        const textColor = colors[`color.status.${status}`];
        const surfaceColor = colors[`color.feedback.${status}.surface`];
        expect(
          contrast(textColor, surfaceColor),
          `${status} on its own feedback background`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const role of ["primary", "secondary", "tertiary"] as const) {
        for (const surface of [
          "surface.subtle",
          "surface.container",
          "surface.recessed",
          "feedback.success.surface",
          "feedback.warning.surface",
          "feedback.error.surface",
          "feedback.info.surface",
          "feedback.neutral.surface",
        ] as const) {
          const foreground = colors[`color.text.${role}`];
          const background = colors[`color.${surface}`];
          expect(contrast(foreground, background), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it("does not apply Tailwind dark styles to the light root itself", () => {
    const entrypoint = readFileSync("src/index.css", "utf8");
    expect(entrypoint).toContain("@custom-variant dark (&:where(:not(.light, .light *)));");
  });

  it("keeps retired overview route selectors out of active CSS", () => {
    const routes = readFileSync("src/routes/AppRoutes.tsx", "utf8");
    expect(routes).toContain('<Route path="/overview" element={<ToStudioRedirect />} />');
    for (const file of ["src/styles/route-density-fixes.css", "src/styles/visual-qa-hotfix.css"]) {
      expect(readFileSync(file, "utf8"), file).not.toContain('data-wireline-route="/overview"');
    }
  });

  it("keeps recipe fields, placeholders, and results on semantic theme tokens", () => {
    const shared = readFileSync("src/components/recipes/shared.tsx", "utf8");
    const playbook = readFileSync("src/components/recipes/forms/CallPlaybookForm.tsx", "utf8");
    expect(shared).toContain("placeholder:text-muted-foreground");
    expect(shared).toContain("border-[var(--wireline-color-border-strong)]");
    expect(shared).toContain("focus-visible:outline-primary");
    expect(shared).toContain("wireline-color-feedback-error-surface");
    expect(shared).not.toContain("placeholder:text-muted/70");
    expect(shared).not.toContain("border-white/10");
    expect(playbook).toContain("text-muted-foreground");
    expect(playbook).toContain("wireline-color-feedback-warning-surface");
    expect(playbook).not.toContain("text-muted text-");
    expect(playbook).not.toContain("bg-white/5");
  });

  it("does not reference undefined brand tiers in active product controls", () => {
    const components = [
      "src/components/insights/TopicsView.tsx",
      "src/components/admin/GrowthPanel.tsx",
      "src/components/IntakeKeysManager.tsx",
      "src/components/recipes/forms/AgentReviewForm.tsx",
    ];
    for (const path of components) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/(?:bg|text|border|hover:bg)-brand-[23](?:\/\d+)?\b/);
    }
    const topics = readFileSync("src/components/insights/TopicsView.tsx", "utf8");
    expect(topics).toContain("wireline-color-feedback-info-surface");
    expect(topics).toContain("wireline-color-feedback-neutral-surface");
    const review = readFileSync("src/components/recipes/forms/AgentReviewForm.tsx", "utf8");
    expect(review).toContain("wireline-color-feedback-warning-surface");
    const intake = readFileSync("src/components/IntakeKeysManager.tsx", "utf8");
    expect(intake).toContain("wireline-color-action-primary-container");
  });

  it("guards semantic text and result-card borders across the BotBound UI", () => {
    const surfaces = [
      "src/components/ui/SegmentStrip.tsx",
      "src/components/PhoneNumberPicker.tsx",
      "src/components/IntakeKeysManager.tsx",
      "src/components/WebhooksManager.tsx",
      "src/components/TrialGateModal.tsx",
      "src/components/AgentTemplates.tsx",
      "src/components/admin/AuditActivityPanel.tsx",
      "src/components/admin/TeamPanel.tsx",
      "src/components/admin/GrowthPanel.tsx",
      "src/components/recipes/forms/ObjectionDrillForm.tsx",
      "src/components/recipes/forms/EnrichLeadForm.tsx",
      "src/components/recipes/forms/AgentReviewForm.tsx",
      "src/components/recipes/forms/CoachForm.tsx",
      "src/components/recipes/forms/ThreadSummaryForm.tsx",
      "src/components/recipes/RecipeModal.tsx",
    ];
    for (const path of surfaces) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/(?:placeholder:)?text-muted(?:\/\d+)?(?=[\s"'])/);
      expect(source, path).not.toMatch(/border-white\/(?:8|10|12|20)\b/);
    }
    const phonePicker = readFileSync("src/components/PhoneNumberPicker.tsx", "utf8");
    expect(phonePicker).not.toContain("text-eyebrow/60");
    for (const path of [
      "src/components/recipes/forms/CoachForm.tsx",
      "src/components/recipes/forms/ThreadSummaryForm.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("wireline-color-feedback-warning-surface");
      expect(source).toContain("wireline-color-feedback-error-surface");
      expect(source).toContain("wireline-color-feedback-neutral-surface");
    }
  });
});
