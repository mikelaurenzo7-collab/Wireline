import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "PublicSiteHeader.tsx"), "utf8");

describe("PublicSiteHeader structure", () => {
  it("traps focus and restores it for the mobile menu", () => {
    expect(src).toContain("restoreFocusRef");
    expect(src).toContain('event.key !== "Tab"');
    expect(src).toContain("restoreFocusRef.current.focus()");
  });

  it("uses reduced-motion-safe menu transitions", () => {
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("reduceMotion ? { opacity: 1 }");
  });
});
