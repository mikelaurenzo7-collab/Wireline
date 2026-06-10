import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "Toast.tsx"), "utf8");

describe("Toast structure", () => {
  it("announces additions through the live region", () => {
    expect(src).toContain('role="log"');
    expect(src).toContain('aria-relevant="additions text"');
    expect(src).toContain('aria-atomic="true"');
  });

  it("respects reduced-motion preferences", () => {
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("reduceMotion ? { opacity: 1 }");
  });
});
