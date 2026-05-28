import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for a design bug caught in a deep nav/UX audit:
// PageShell silently dropped the required `title` prop — every page
// passed `title="X"` but no H1 was rendered. On mobile/tablet,
// TopBar's breadcrumb and AppShell's DesktopContextBar are both
// `hidden lg:flex`, so phones saw NO page title at all. The fix
// renders an H1 inside the PageShell header, hidden on lg+ to
// avoid duplication with DesktopContextBar's H1.

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_SHELL = readFileSync(join(__dirname, "PageShell.tsx"), "utf8");

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
