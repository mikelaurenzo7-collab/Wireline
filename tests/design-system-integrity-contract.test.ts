import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Design-system integrity.
 *
 * Wireline's token layer is well specified; what kept failing was the wiring
 * between a token and the thing a user actually sees. Each block below pins one
 * connection that was silently broken — a typeface the utility never reached, a
 * touch target an unlayered rule capped, a token diluted below AA.
 */

describe("the brand typefaces reach the Tailwind utilities", () => {
  it("registers all three families in @theme so font-mono is IBM Plex Mono", () => {
    const index = read("src/index.css");
    const theme = index.slice(index.indexOf("@theme inline {"), index.indexOf("@layer base"));
    // Without these, `font-mono` fell back to Tailwind's default ui-monospace
    // stack and every label/eyebrow in the product rendered in the OS face.
    expect(theme).toContain("--font-mono: var(--wireline-font-mono);");
    expect(theme).toContain("--font-sans: var(--wireline-font-sans);");
    expect(theme).toContain("--font-serif: var(--wireline-font-display);");
  });

  it("keeps the families those variables point at defined", () => {
    const prose = read("src/styles/typography-prose.css");
    expect(prose).toContain("--wireline-font-mono:");
    expect(prose).toContain("var(--wireline-font-family-mono)");
    expect(read("src/styles/tokens.generated.css")).toContain(
      '--wireline-font-family-mono: "IBM Plex Mono"',
    );
  });
});

describe("touch targets are not capped by an unlayered rule", () => {
  it("layers the button size floor so utilities can raise it", () => {
    const foundation = read("src/styles/foundation.css");
    const rule = foundation.slice(
      foundation.indexOf("min-height: var(--wl-target-minimum)") - 400,
      foundation.indexOf("min-height: var(--wl-target-minimum)") + 200,
    );
    // Tailwind v4 emits utilities into @layer utilities, and an unlayered rule
    // beats any layer — so min-h-11 on a button rendered at 40px.
    expect(rule).toContain("@layer base {");
  });

  it("gives coarse pointers the comfortable floor on every button, not just icons", () => {
    const refinement = read("src/styles/system-refinement-pass-two.css");
    const coarse = refinement.slice(refinement.indexOf("@media (any-pointer: coarse)"));
    expect(coarse).toContain("--wireline-interaction-target-comfortable");
    expect(coarse).toContain('[data-slot="button"],');
  });

  it("does not let a stylesheet quietly undercut the public footer targets", () => {
    // Measured, not assumed: the footer links carried `min-h-11` in their class
    // list while two unlayered rules pinned them to 36px and 40px, so the
    // utility was decorative and the rendered target never changed. Both rules
    // now resolve through the comfortable-target token.
    const responsive = read("src/styles/responsive.css");
    const footerNav = responsive.slice(responsive.indexOf(".marketing-footer-nav a {"));
    expect(footerNav.slice(0, 300)).toContain("--wireline-interaction-target-comfortable");
    expect(footerNav.slice(0, 300)).not.toContain("min-height: 2.25rem");

    const cta = read("src/styles/cta-readability.css");
    const footerLink = cta.slice(cta.indexOf(".marketing-surface footer a {"));
    expect(footerLink.slice(0, 300)).toContain("--wireline-interaction-target-comfortable");
    expect(footerLink.slice(0, 300)).not.toContain("min-height: 40px");
  });

  it("carries the floor on the Button primitive so `asChild` links match real buttons", () => {
    const button = read("src/components/atoms/Button.tsx");
    // With asChild the rendered node is an <a>, which matches neither `button`
    // nor [role="button"] and inherited no floor at all.
    expect(button).toContain("min-h-[var(--wireline-interaction-target-minimum,40px)]");
    // Text links opt out — they are type, not a control.
    expect(button).toContain('link: "h-auto min-h-0');
  });
});

describe("no text token is diluted below the AA floor", () => {
  const placeholderRules = [
    "src/styles/design-system.css",
    "src/styles/stitch-patterns.css",
    "src/styles/studio-operations.css",
  ];

  it("uses the tertiary token for placeholders instead of a transparent mix", () => {
    for (const path of placeholderRules) {
      const css = read(path);
      const placeholderBlocks = css
        .split("\n")
        .filter((line) => line.includes("::placeholder"))
        .join("\n");
      expect(placeholderBlocks.length, path).toBeGreaterThan(0);
      // color-mix(..., transparent) on a text token is what produced 2.86:1 on
      // the Studio composer, whose label is sr-only.
      const rule = css.slice(css.indexOf("::placeholder"), css.indexOf("::placeholder") + 200);
      expect(rule, path).toContain("var(--wireline-color-text-tertiary)");
      expect(rule, path).not.toContain("transparent)");
    }
  });

  it("gives the Studio brief the shared focus treatment, not a 1px 40%-opacity ring", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    expect(studio).not.toContain("focus:ring-1 focus:ring-primary/40");
    expect(studio).toContain("focus-visible:ring-2");
    expect(studio).toContain("focus-visible:border-[var(--wireline-color-focus-default)]");
  });

  it("paints success text with the success token, never the violet action token", () => {
    const importer = read("src/components/training/WebsiteKnowledgeImport.tsx");
    const notice = importer.slice(importer.indexOf("{notice ? ("));
    expect(notice).toContain("text-[var(--wireline-color-status-success)]");
    expect(notice).not.toContain("text-[var(--wireline-color-action-primary-pressed)]");
    expect(read("src/components/KnowledgeBaseClaude.tsx")).not.toContain("TEXT_HEX_DEEP");
  });
});

describe("radii come off the token scale", () => {
  it("leaves no one-off pixel radii on the Training and shell surfaces", () => {
    for (const path of [
      "src/components/training/WebsiteKnowledgeImport.tsx",
      "src/components/KnowledgeBaseClaude.tsx",
      "src/components/WorkspaceShell.tsx",
    ]) {
      // 5px / 7px / 8px / 9px were all in use inside cards whose own radius is
      // 20px, so a single card carried three different corner treatments.
      expect(read(path).match(/rounded-\[\d+px\]/g) ?? [], path).toEqual([]);
    }
  });
});

describe("async state on the primary surfaces is announced", () => {
  it("marks the Overview KPI row busy and speaks the result", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    expect(overview).toContain("aria-busy={loadingDashboard}");
    expect(overview).toContain('<p className="sr-only" role="status">');
    expect(overview).toContain("needing attention.");
  });
});

describe("the shell keeps the workspace reachable at high zoom", () => {
  it("scrolls its banners with the content instead of stealing fixed height", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const scroller = shell.indexOf("wl-workspace-content");
    const verifyBanner = shell.indexOf("<EmailVerifyBanner />");
    const nudge = shell.indexOf("<ActivationNudge className=");
    // html/body/#root are overflow:hidden, so this scroller is the only way to
    // reach content — a banner mounted outside it is height nobody can recover.
    expect(scroller).toBeGreaterThan(-1);
    expect(verifyBanner).toBeGreaterThan(scroller);
    expect(nudge).toBeGreaterThan(scroller);
  });

  it("names the mobile dock tabs so their visible label is in the accessible name", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(shell).toContain("item.shortLabel && item.shortLabel !== item.label");
    expect(shell).toContain("`${item.shortLabel} — ${item.label}`");
  });
});
