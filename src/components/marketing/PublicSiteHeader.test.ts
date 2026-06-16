import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "PublicSiteHeader.tsx"), "utf8");

describe("PublicSiteHeader structure", () => {
  it("exposes the mobile menu as an accessible modal dialog", () => {
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain("aria-expanded={menuOpen}");
  });

  it("dismisses the mobile menu on Escape", () => {
    // Keyboard users can always close the menu; motion is reduced globally via
    // the prefers-reduced-motion CSS layer, so no per-component motion guard.
    expect(src).toContain('event.key === "Escape"');
    expect(src).toContain("setMenuOpen(false)");
  });
});
