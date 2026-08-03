import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("auth transition and control case contract", () => {
  it("keeps auth guidance readable while headings stay in the title tier", () => {
    const css = source("src/styles/e2e-design-polish.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const proseRule =
      css.match(/\.marketing-surface \.wl-auth-card :is\(([^)]*)\)\s*\{[^}]*\}/)?.[0] ?? "";

    expect(proseRule, "auth cards need a sentence-case prose reset").not.toBe("");
    expect(proseRule).toContain("p, li");
    expect(proseRule).toContain("text-transform: none");
    expect(proseRule).not.toMatch(/h[1-6]/);
  });

  it("keeps marketing CTAs and segmented tabs in the shared control tier", () => {
    const css = source("src/styles/e2e-design-polish.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const ctaRule =
      css.match(
        /\.marketing-surface :where\(\.marketing-btn-primary, \.marketing-btn-secondary\)\s*\{[^}]*\}/,
      )?.[0] ?? "";
    const segmentedRule =
      css.match(/\.marketing-surface \.wl-segmented__item\s*\{[^}]*\}/)?.[0] ?? "";

    for (const [name, rule] of [
      ["marketing CTA", ctaRule],
      ["segmented tab", segmentedRule],
    ] as const) {
      expect(rule, `${name} rule must be present`).not.toBe("");
      expect(rule).toContain("text-transform: uppercase");
      expect(rule).toContain("var(--wl-caps-control-tracking)");
    }
  });

  it("uses the same branded auth canvas for OAuth and invitation transitions", () => {
    for (const file of ["src/pages/OAuthComplete.tsx", "src/pages/AcceptInvite.tsx"]) {
      const page = source(file);
      expect(page).toContain("authCanvas");
      expect(page).toContain("wl-auth-card");
      expect(page).toContain("wl-auth-brand-chip");
      expect(page).toContain("WirelineMark");
      expect(page).toContain('id="main-content"');
      expect(page).toContain('aria-live="polite"');
    }
  });

  it("keeps transition explanations and provider errors in prose elements", () => {
    const invite = source("src/pages/AcceptInvite.tsx");
    const oauth = source("src/pages/OAuthComplete.tsx");

    expect(invite).toMatch(/<p[\s\S]*?role=\{status === "error" \? "alert" : undefined\}/);
    expect(oauth).toMatch(/<p[\s\S]*?role=\{error \? "alert" : undefined\}/);
    expect(invite).toContain("text-caption leading-relaxed");
    expect(oauth).toContain("text-caption leading-relaxed");
  });

  it("hard-protects semantic authored content across email, transcript, and artifact surfaces", () => {
    const css = source("src/styles/e2e-design-polish.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const authoredRule =
      css.match(
        /:is\(\.wl-ui-caps, \.wl-cased\) \[data-wireline-preserve-case\],[\s\S]*?\{[^}]*\}/,
      )?.[0] ?? "";
    const conversation = source("src/components/molecules/ConversationMessage.tsx");
    const emailInbox = source("src/components/EmailInbox.tsx");

    expect(authoredRule, "semantic authored content needs a hard case reset").not.toBe("");
    expect(authoredRule).toContain("text-transform: none !important");
    expect(authoredRule).toContain("letter-spacing: normal !important");
    expect(conversation).toContain("data-wireline-preserve-case");
    expect(emailInbox).toContain("wl-preserve-case");
  });

  it("keeps legal prose explicitly outside the global marketing caps voice", () => {
    const css = source("src/styles/e2e-design-polish.css");
    const privacy = source("src/components/PrivacyPolicyPage.tsx");
    const terms = source("src/components/LegalPage.tsx");

    expect(css).toContain(".marketing-surface .prose");
    expect(css).toContain(".prose :is(p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, a, span)");
    expect(privacy).toContain("prose prose-sm sm:prose-base");
    expect(terms).toContain("prose");
  });
});
