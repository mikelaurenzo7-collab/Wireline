import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WIRELINE_DESIGN_VISION } from "../src/lib/wireline-design-vision";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/**
 * Contract: Wireline Letterpress polish layer.
 *
 * Guards the polish primitives that ship in `src/styles/letterpress-polish.css`
 * and ensures the new utilities are wired into the design system, the
 * design-vision manifest, and the auth + marketing surfaces. Any change that
 * breaks one of these invariants must update the manifest and this test in
 * the same change.
 */
describe("Wireline Letterpress polish layer", () => {
  it("imports the polish stylesheet from the global index", () => {
    const indexCss = read("src/index.css");
    expect(indexCss).toContain('@import "./styles/letterpress-polish.css"');
  });

  it("ships the new polish primitives in the polish stylesheet", () => {
    const polish = read("src/styles/letterpress-polish.css");
    for (const name of [
      "wl-paper",
      "wl-paper-elevated",
      "wl-letterpress",
      "wl-letterpress-raised",
      "wl-letterpress-recessed",
      "wl-focus-ring",
      "wl-focus-ring-halo",
      "wl-focus-ring-wire",
      "wl-glow-primary",
      "wl-glow-wire",
      "wl-motion-spring",
      "wl-motion-wireline",
      "wl-motion-accelerate",
      "wl-press",
      "wl-transition-press",
      "wl-reveal",
      "wl-chip",
      "wl-chip--success",
      "wl-chip--warning",
      "wl-chip--error",
      "wl-chip--info",
      "wl-chip--primary",
      "wl-chip--wire",
      "wl-metric-tile",
      "wl-empty",
      "wl-skeleton",
      "wl-divider",
      "wl-divider-wire",
      "wl-press-highlight",
      "wl-eyebrow",
      "wl-display-mark",
      "wl-banner",
      "wl-banner__icon",
      "wl-banner__body",
      "wl-banner__title",
      "wl-banner__detail",
      "wl-banner--info",
      "wl-banner--success",
      "wl-banner--warning",
      "wl-banner--warn",
      "wl-banner--error",
      "wl-banner--critical",
      "wl-segmented",
      "wl-segmented__item",
      "wl-data-row",
      "wl-data-row__leading",
      "wl-data-row__main",
      "wl-data-row__title",
      "wl-data-row__detail",
      "wl-data-row__trailing",
      "wl-key-value",
      "wl-key-value__key",
      "wl-key-value__value",
      "wl-field",
      "wl-field__label",
      "wl-field__hint",
      "wl-field__error",
      "wl-code",
      "wl-link",
      "wl-surface-tint",
    ]) {
      expect(polish).toContain(`.${name}`);
    }
  });

  it("uses platinum wire as the eyebrow rule and tokenized press highlight", () => {
    const polish = read("src/styles/letterpress-polish.css");
    expect(polish).toMatch(
      /\.wl-eyebrow::before[\s\S]*var\(--wireline-color-action-secondary-default\)/,
    );
    expect(polish).toMatch(
      /\.wl-press-highlight::before[\s\S]*var\(--wireline-color-pressHighlight\)/,
    );
  });

  it("honors prefers-reduced-motion for shimmer and press", () => {
    const polish = read("src/styles/letterpress-polish.css");
    expect(polish).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.wl-skeleton::after[\s\S]*animation: none/,
    );
    expect(polish).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.wl-press[\s\S]*transform: none/,
    );
  });

  it("does not reintroduce the retired purple/blue palette", () => {
    const polish = read("src/styles/letterpress-polish.css");
    expect(polish).not.toMatch(/#5D3FD3|#451EBB|#C77DFF|#F8F9FF|#EFF4FF|#E5EEFF/i);
  });

  it("exposes the refined motion vocabulary in the design vision manifest", () => {
    expect(WIRELINE_DESIGN_VISION.motion.durations).toContain("deliberate 440ms");
    expect(WIRELINE_DESIGN_VISION.motion.easings).toEqual(
      expect.arrayContaining(["standard", "spring", "wireline", "emphasized"]),
    );
    expect(WIRELINE_DESIGN_VISION.motion.pressScale).toBe(0.985);
  });

  it("lists every new polish utility group in the design vision manifest", () => {
    expect(WIRELINE_DESIGN_VISION.utilities).toEqual(
      expect.objectContaining({
        surface: expect.arrayContaining([
          "wl-paper",
          "wl-paper-elevated",
          "wl-letterpress",
          "wl-letterpress-raised",
          "wl-letterpress-recessed",
        ]),
        feedback: expect.arrayContaining([
          "wl-focus-ring",
          "wl-focus-ring-halo",
          "wl-focus-ring-wire",
          "wl-glow-primary",
          "wl-glow-wire",
        ]),
        motion: expect.arrayContaining([
          "wl-press",
          "wl-motion-spring",
          "wl-motion-wireline",
          "wl-transition-press",
          "wl-reveal",
        ]),
        chips: expect.arrayContaining([
          "wl-chip",
          "wl-chip--success",
          "wl-chip--warning",
          "wl-chip--error",
          "wl-chip--info",
          "wl-chip--primary",
          "wl-chip--wire",
        ]),
        layout: expect.arrayContaining([
          "wl-metric-tile",
          "wl-empty",
          "wl-skeleton",
          "wl-divider",
          "wl-divider-wire",
          "wl-press-highlight",
        ]),
        voice: expect.arrayContaining([
          "wl-eyebrow",
          "wl-eyebrow--primary",
          "wl-eyebrow--muted",
          "wl-eyebrow--no-rule",
          "wl-display-mark",
        ]),
      }),
    );
  });

  it("uses the polish primitives in the Overview greeting, metrics, and agent row", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    expect(overview).toContain("wl-metric-tile");
    expect(overview).toContain("wl-reveal");
    expect(overview).toContain("wl-chip wl-chip--${");
    expect(overview).toContain("wl-focus-ring-halo");
    expect(overview).toContain("wl-press");
    // Quick actions use Button atoms; recent-call rows use the data-row
    // primitive; empty state uses the EmptyState atom (renders wl-empty).
    expect(overview).toContain("wl-data-row");
    expect(overview).toContain("wl-data-row--divided");
    expect(overview).toContain("EmptyState");
  });

  it("uses the polish primitives in the 404 page", () => {
    const notFound = read("src/components/layout/NotFound.tsx");
    expect(notFound).toContain("wl-display-mark");
    expect(notFound).toContain("wl-eyebrow");
    expect(notFound).toContain("wl-paper");
    expect(notFound).toContain("wl-press");
    expect(notFound).toContain("wl-focus-ring-halo");
    // Masterful upgrade: the unfound pathname renders as a wl-code chip
    // instead of an ad-hoc black-on-dark inline code block.
    expect(notFound).toContain("wl-code");
  });

  it("wires the banner tone variants into the EmailVerify banner", () => {
    // TrialBanner was removed 2026-08-13 (unmounted); the tone scale below
    // remains canonical for every future banner.
    expect(existsSync("src/components/layout/TrialBanner.tsx")).toBe(false);
    const email = read("src/components/layout/EmailVerifyBanner.tsx");
    expect(email).toContain("wl-banner--info");
    expect(email).toContain("wl-banner__icon");
    // The polish layer must define every tone these banners reference.
    const polish = read("src/styles/letterpress-polish.css");
    expect(polish).toContain(".wl-banner--warn");
    expect(polish).toContain(".wl-banner--critical");
  });

  it("extends the reveal stagger beyond the original five tiers", () => {
    const polish = read("src/styles/letterpress-polish.css");
    expect(polish).toContain(".wl-reveal-6");
    expect(polish).toContain(".wl-reveal-7");
    expect(polish).toContain(".wl-reveal-8");
  });

  it("upgrades the atoms (Button, Card, EmptyState, Skeleton) with the polish primitives", () => {
    const button = read("src/components/atoms/Button.tsx");
    const card = read("src/components/molecules/Card.tsx");
    const empty = read("src/components/atoms/EmptyState.tsx");
    const skeleton = read("src/components/atoms/Skeleton.tsx");

    // Button ships a new "wire" silver variant on top of the existing palette.
    // Accept both single-line (`wire: "..."`) and multi-line (`wire:\n  "..."`)
    // cva declarations so prettier reformatting cannot drift the contract.
    expect(button).toMatch(/wire:\s*"/);
    expect(button).toContain("var(--wireline-color-action-secondary-default)");
    expect(button).toContain("var(--wireline-elevation-wireGlow)");
    expect(button).toContain("var(--wireline-color-action-secondary-container)");

    // Card adopts the new inset shadow + the paper/recessed/wire elevation variants.
    expect(card).toContain("var(--wireline-elevation-inset)");
    expect(card).toContain("var(--wireline-elevation-insetRaised)");
    expect(card).toMatch(/paper:\s*"/);
    expect(card).toMatch(/recessed:\s*"/);
    expect(card).toMatch(/wire:\s*"/);
    expect(card).toContain("wl-transition-press");

    // EmptyState atom re-exports canonical ui/EmptyState (wl-empty-state + wl-empty__*).
    expect(empty).toContain("wl-empty");
    expect(empty).toContain("wl-eyebrow");

    // Skeleton reuses the new shimmer primitive.
    expect(skeleton).toContain("wl-skeleton");
  });

  it("registers the new tokens in the generated artifact", () => {
    const tokens = read("src/styles/tokens.generated.css");
    expect(tokens).toContain("--wireline-color-action-primary-hover: #C4B5FD");
    expect(tokens).toContain("--wireline-color-action-secondary-hover: #DEE1E8");
    expect(tokens).toContain("--wireline-color-canvas-deeper: #050508");
    expect(tokens).toContain("--wireline-color-canvas-warmer: #101018");
    expect(tokens).toContain("--wireline-color-surface-recessed: #08070B");
    expect(tokens).toContain("--wireline-color-border-soft: #1C1A22");
    expect(tokens).toContain("--wireline-color-focus-wire: #C7CCD6");
    expect(tokens).toContain("--wireline-color-glow-primary:");
    expect(tokens).toContain("--wireline-color-glow-wire:");
    expect(tokens).toContain("--wireline-color-pressHighlight:");
    expect(tokens).toContain("--wireline-motion-easing-spring:");
    expect(tokens).toContain("--wireline-motion-easing-wireline:");
    expect(tokens).toContain("--wireline-elevation-inset:");
    expect(tokens).toContain("--wireline-elevation-insetRaised:");
    expect(tokens).toContain("--wireline-elevation-wirelineRing:");
    expect(tokens).toContain("--wireline-elevation-wireGlow:");
    expect(tokens).toContain("--wireline-radius-2xl: 28px");
    expect(tokens).toContain("--wireline-radius-xs: 6px");
    expect(tokens).toContain("--wireline-motion-duration-deliberate: 440ms");
    expect(tokens).toContain("--wireline-interaction-target-primary: 48px");
  });

  it("exports the new atoms (Chip, MetricTile, Eyebrow, Paper, Reveal) from the atom barrel", () => {
    const index = read("src/components/atoms/index.ts");
    expect(index).toContain('export * from "./Chip"');
    expect(index).toContain('export * from "./MetricTile"');
    expect(index).toContain('export * from "./Eyebrow"');
    expect(index).toContain('export * from "./Paper"');
    expect(index).toContain('export * from "./Reveal"');
    for (const atom of ["Chip", "MetricTile", "Eyebrow", "Paper", "Reveal"]) {
      expect(existsSync(resolve(root, `src/components/atoms/${atom}.tsx`))).toBe(true);
    }
  });

  it("unifies the letterpress cap to cover wl-paper and wl-metric-tile in the app signature", () => {
    const signature = read("src/styles/wireline-app-signature.css");
    expect(signature).toMatch(/\.wl-workspace-content \.wl-paper::before/);
    expect(signature).toMatch(/\.wl-overview \.wl-metric-tile::before/);
    expect(signature).toMatch(/\.wl-operate-surface \.wl-paper::before/);
  });

  it("keeps StripeBillingCard free of the raw amber/rose/white palette", () => {
    const card = read("src/components/StripeBillingCard.tsx");
    expect(card).not.toMatch(/amber-500|rose-500|text-white/);
    expect(card).toContain("Chip");
    expect(card).toContain("var(--wireline-color-feedback-warning-surface)");
    expect(card).toContain("var(--wireline-color-feedback-error-surface)");
  });

  it("adds visible focus rings to the auth surface", () => {
    const auth = read("src/styles/precision-auth.css");
    expect(auth).toMatch(
      /\.wl-stitch-oauth-btn:focus-visible[\s\S]*var\(--wireline-color-focus-default\)/,
    );
    expect(auth).toMatch(/box-shadow:[\s\S]*var\(--wireline-color-glow-primary\)/);
    expect(auth).toMatch(/var\(--wireline-color-glow-wire\)/);
  });

  it("keeps account entry centered instead of splitting the viewport", () => {
    const auth = read("src/styles/precision-auth.css");
    const portal = read("src/components/AuthPortal.tsx");
    expect(auth).toMatch(/\.wl-stitch-auth-shell[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(auth).toContain(".wl-auth-entry-mark");
    expect(portal).toContain("max-w-[520px]");
    expect(portal).not.toContain("AuthBrandPanel");
  });

  it("routes AuthPortal error and success notices through the shared tokenized primitive", () => {
    const portal = read("src/components/AuthPortal.tsx");
    const statusNotice = read("src/components/molecules/StatusNotice.tsx");
    expect(portal).not.toMatch(/border-rose-500|bg-rose-500|text-rose-600/);
    expect(portal).toMatch(
      /<StatusNotice[\s\S]{0,240}?tone="destructive"[\s\S]{0,120}?title=\{error\}[\s\S]{0,900}?Sign in instead[\s\S]{0,120}?<\/StatusNotice>/,
    );
    expect(portal).toContain('<StatusNotice tone="success" title={message} />');
    expect(statusNotice).toContain("var(--wireline-color-feedback-error-border)");
    expect(statusNotice).toContain("var(--wireline-color-feedback-success-surface)");
  });

  it("adopts the MetricTile atom in the Knowledge surface", () => {
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    expect(knowledge).toContain("MetricTile");
    expect(knowledge).toContain("wl-metric-tile");
  });

  it("does not add a parallel palette or non-durable CSS module", () => {
    expect(existsSync(resolve(root, "src/styles/letterpress-polish.css"))).toBe(true);
    expect(existsSync(resolve(root, "src/styles/zip-platform-tokens.css"))).toBe(false);
  });
});
