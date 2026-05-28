import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for two design bugs caught in a deep nav/UX audit:
//
//   1. PageShell silently dropped the required `title` prop — every page
//      passed `title="X"` but no H1 was rendered. On mobile/tablet,
//      TopBar's breadcrumb and AppShell's DesktopContextBar are both
//      `hidden lg:flex`, so phones saw NO page title at all. The fix
//      renders an H1 inside the PageShell header, hidden on lg+ to
//      avoid duplication with DesktopContextBar's H1.
//
//   2. Global `border-radius: 0 !important` silently defeated
//      `rounded-full` everywhere (avatars, badges, loading spinner,
//      ambient glow halos, live-pulse dots). Sharp corners on cards is
//      intentional and enforced by the @theme `--radius-*: 0` tokens;
//      the `!important` was overkill and caused 500+ visual
//      regressions across the app. The fix drops `!important` so token
//      overrides keep cards sharp while opt-in classes like
//      `rounded-full` and arbitrary `rounded-[Npx]` values can render.

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_SHELL = readFileSync(join(__dirname, "PageShell.tsx"), "utf8");
const INDEX_CSS = readFileSync(join(__dirname, "..", "index.css"), "utf8");

describe("PageShell — renders the `title` prop", () => {
  it("emits an <h1> bound to the title prop", () => {
    // The title prop is part of the editorial header and must be visible.
    // Match `<h1 ...>{title}</h1>` allowing any classNames between.
    expect(PAGE_SHELL).toMatch(/<h1\b[^>]*>\s*\{title\}\s*<\/h1>/);
  });

  it("hides the page H1 on lg+ to avoid duplication with DesktopContextBar", () => {
    // DesktopContextBar in AppShell.tsx renders its own H1 inside the
    // sticky chrome at lg+. Two H1s on the same page is an a11y issue
    // and visually noisy; PageShell's H1 must opt out via `lg:hidden`.
    expect(PAGE_SHELL).toMatch(/<h1\b[^>]*\blg:hidden\b/);
  });
});

describe("index.css — global border-radius reset does not !important", () => {
  it("the universal-selector border-radius rule is plain (no !important)", () => {
    // Match the global reset block. The rule MUST NOT carry !important
    // — otherwise `rounded-full`, `rounded-[Npx]`, and every avatar /
    // badge / spinner / radial glow renders as a square.
    const match = INDEX_CSS.match(
      /\*,\s*\n?\s*\*::before,\s*\n?\s*\*::after\s*\{[^}]*border-radius:\s*0\s*;?[^}]*\}/m,
    );
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/border-radius:\s*0\s*!important/);
  });
});
