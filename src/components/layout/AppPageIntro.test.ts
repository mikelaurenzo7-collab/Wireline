import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Same constraint as PageShell.title.test.ts, applied to the sibling
// AppPageIntro primitive (used by routes that don't go through PageShell
// — Live Ops / CommandCenter is the headline example).
//
// AppShell's DesktopContextBar renders the page H1 in the sticky chrome
// on lg+. Without the `lg:hidden` guard on the AppPageIntro H1, every
// page using AppPageIntro renders the title twice on desktop. Live Ops
// shipped with this bug visible at the top of the dashboard.

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_PAGE_INTRO = readFileSync(join(__dirname, "AppPageIntro.tsx"), "utf8");

describe("AppPageIntro — title H1 is hidden on lg+", () => {
  it("emits an <h1> bound to the title prop", () => {
    expect(APP_PAGE_INTRO).toMatch(/<h1\b[^>]*>\s*\{title\}\s*<\/h1>/);
  });

  it("the title H1 carries `lg:hidden` to avoid duplicating DesktopContextBar", () => {
    expect(APP_PAGE_INTRO).toMatch(/<h1\b[^>]*\blg:hidden\b/);
  });
});
