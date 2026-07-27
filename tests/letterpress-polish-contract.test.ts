import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const hexColorPattern = /#[0-9a-fA-F]{3,8}\b/g;

function expectNoRawHex(source: string) {
  expect(source.match(hexColorPattern) ?? []).toEqual([]);
}

describe("letterpress polish contract", () => {
  it("imports the polish stylesheet from the global index", () => {
    const indexCss = read("src/index.css");
    expect(indexCss).toContain('@import "./styles/wireline-polish.css";');
  });

  it("ships the new polish primitives in the polish stylesheet", () => {
    const css = read("src/styles/wireline-polish.css");
    for (const selector of [
      ".wl-chip",
      ".wl-metric-tile",
      ".wl-eyebrow",
      ".wl-paper",
      ".wl-reveal",
      ".wl-press",
      ".wl-command-strip",
      ".wl-state-strip",
      ".wl-checklist",
      ".wl-action-cluster",
      ".wl-guidance-card",
      ".wl-progress-rail",
      ".wl-dashboard-banner",
      ".wl-onboarding-card",
      ".wl-breadcrumb-bar",
      ".wl-density-compact",
      ".wl-density-comfortable",
      ".wl-data-table-wrap",
      ".wl-feedback-strip",
      ".wl-loading-block",
      ".wl-settings-section",
      ".wl-settings-row",
      ".wl-trust-block",
      ".wl-studio-section",
      ".wl-studio-review",
    ]) {
      expect(css).toContain(selector);
    }
  });

  it("uses platinum wire as the eyebrow rule and tokenized press highlight", () => {
    const css = read("src/styles/wireline-polish.css");
    expect(css).toContain("var(--wireline-color-platinum)");
    expect(css).toContain("var(--wireline-color-platinum-glint)");
    expect(css).toContain("var(--wireline-color-platinum-deep)");
    expect(css).toContain("var(--wireline-color-platinum-muted)");
    expect(css).toContain("var(--wireline-color-surface-app)");
  });

  it("honors prefers-reduced-motion for shimmer and press", () => {
    const css = read("src/styles/wireline-polish.css");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.wl-reveal/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.wl-press/);
  });

  it("does not reintroduce the retired purple/blue palette", () => {
    const css = read("src/styles/wireline-polish.css");
    expect(css).not.toMatch(/purple|violet|indigo|blue-/i);
    expectNoRawHex(css);
  });

  it("exposes the refined motion vocabulary in the design vision manifest", () => {
    const vision = read("design/wireline-design-vision.json");
    expect(vision).toContain('"motion"');
    expect(vision).toContain('"quick"');
    expect(vision).toContain('"standard"');
    expect(vision).toContain('"deliberate"');
    expect(vision).toContain('"press"');
    expect(vision).toContain('"shimmer"');
  });

  it("lists every new polish utility group in the design vision manifest", () => {
    const vision = read("design/wireline-design-vision.json");
    for (const utility of [
      "chip",
      "metricTile",
      "eyebrow",
      "paper",
      "reveal",
      "commandStrip",
      "stateStrip",
      "checklist",
      "actionCluster",
      "guidanceCard",
      "progressRail",
      "dashboardBanner",
      "onboardingCard",
      "breadcrumbBar",
      "density",
      "dataTableWrap",
      "feedbackStrip",
      "loadingBlock",
      "settingsSection",
      "settingsRow",
      "trustBlock",
      "studioSection",
      "studioReview",
    ]) {
      expect(vision).toContain(`"${utility}"`);
    }
  });

  it("uses the polish primitives in the Overview greeting, metrics, and agent row", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    expect(overview).toContain("wl-eyebrow");
    expect(overview).toContain("wl-metric-tile");
    expect(overview).toContain("wl-reveal");
    expect(overview).toContain("wl-chip");
  });

  it("uses the polish primitives in the 404 page", () => {
    const notFound = read("src/pages/NotFound.tsx");
    expect(notFound).toContain("wl-paper");
    expect(notFound).toContain("wl-eyebrow");
  });

  it("wires the banner tone variants into the Trial and EmailVerify banners", () => {
    const trial = read("src/components/TrialBanner.tsx");
    const verify = read("src/components/EmailVerifyBanner.tsx");
    expect(trial).toContain("wl-dashboard-banner");
    expect(trial).toContain("wl-dashboard-banner-warning");
    expect(verify).toContain("wl-dashboard-banner");
    expect(verify).toContain("wl-dashboard-banner-info");
  });

  it("extends the reveal stagger beyond the original five tiers", () => {
    const css = read("src/styles/wireline-polish.css");
    expect(css).toContain(".wl-reveal-stagger-6");
    expect(css).toContain(".wl-reveal-stagger-7");
    expect(css).toContain(".wl-reveal-stagger-8");
  });

  it("upgrades the atoms (Button, Card, EmptyState, Skeleton) with the polish primitives", () => {
    const button = read("src/components/atoms/Button.tsx");
    const card = read("src/components/atoms/Card.tsx");
    const empty = read("src/components/atoms/EmptyState.tsx");
    const skeleton = read("src/components/atoms/Skeleton.tsx");
    expect(button).toContain("wl-press");
    expect(card).toContain("wl-paper");
    expect(empty).toContain("wl-paper");
    expect(skeleton).toContain("wl-loading-block");
  });

  it("registers the new tokens in the generated artifact", () => {
    const tokens = read("src/styles/generated/wireline-tokens.css");
    for (const token of [
      "--wireline-color-platinum",
      "--wireline-color-platinum-glint",
      "--wireline-color-platinum-deep",
      "--wireline-color-platinum-muted",
      "--wireline-color-surface-app",
      "--wireline-motion-quick",
      "--wireline-motion-standard",
      "--wireline-motion-deliberate",
    ]) {
      expect(tokens).toContain(token);
    }
  });

  it("exports the new atoms (Chip, MetricTile, Eyebrow, Paper, Reveal) from the atom barrel", () => {
    const barrel = read("src/components/atoms/index.ts");
    for (const atom of ["Chip", "MetricTile", "Eyebrow", "Paper", "Reveal"]) {
      expect(barrel).toContain(`export * from "./${atom}";`);
    }
  });

  it("unifies the letterpress cap to cover wl-paper and wl-metric-tile in the app signature", () => {
    const css = read("src/styles/wireline-polish.css");
    expect(css).toMatch(/\.wl-paper[\s\S]*\.wl-metric-tile[\s\S]*::before/);
  });

  it("keeps StripeBillingCard free of the raw amber/rose/white palette", () => {
    const billing = read("src/components/billing/StripeBillingCard.tsx");
    expect(billing).not.toMatch(/amber-|rose-|white/);
    expect(billing).toContain("var(--wireline-color-status-warning)");
    expect(billing).toContain("var(--wireline-color-status-success)");
    expect(billing).toContain("var(--wireline-color-text-primary)");
  });

  it("adds visible focus rings to the auth surface", () => {
    const auth = read("src/styles/precision-auth.css");
    expect(auth).toContain(".wl-stitch-input:focus-visible");
    expect(auth).toContain(".wl-stitch-oauth-btn:focus-visible");
    expect(auth).toContain("outline: 2px solid var(--wireline-color-action-focus)");
  });

  it("keeps account entry centered instead of splitting the viewport", () => {
    const auth = read("src/styles/precision-auth.css");
    const portal = read("src/components/AuthPortal.tsx");
    expect(auth).toMatch(
      /\.wl-stitch-auth-shell[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(auth).toContain(".wl-auth-entry-mark");
    expect(portal).toContain("max-w-[520px]");
    expect(portal).not.toContain("AuthBrandPanel");
  });

  it("routes AuthPortal error and success notices through the shared tokenized primitive", () => {
    const portal = read("src/components/AuthPortal.tsx");
    const statusNotice = read("src/components/molecules/StatusNotice.tsx");
    expect(portal).not.toMatch(/border-rose-500|bg-rose-500|text-rose-600/);
    expect(portal).toContain('<StatusNotice tone="destructive" title={error} />');
    expect(portal).toContain('<StatusNotice tone="success" title={message} />');
    expect(statusNotice).toContain("var(--wireline-color-feedback-error-border)");
    expect(statusNotice).toContain("var(--wireline-color-feedback-success-surface)");
  });

  it("adopts the MetricTile atom in the Knowledge surface", () => {
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    expect(knowledge).toContain("MetricTile");
  });

  it("does not add a parallel palette or non-durable CSS module", () => {
    const css = read("src/styles/wireline-polish.css");
    expectNoRawHex(css);
    expect(css).not.toMatch(/rgba?\(/);
  });
});
