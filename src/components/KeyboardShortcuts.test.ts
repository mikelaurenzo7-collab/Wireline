import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "KeyboardShortcuts.tsx"), "utf8");

describe("KeyboardShortcuts structure", () => {
  it("restores focus to the trigger on close", () => {
    expect(src).toContain("restoreFocusRef");
    expect(src).toContain("restoreFocusRef.current.focus()");
  });

  it("is reduced-motion safe", () => {
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("reduceMotion ? { opacity: 1 }");
  });
});
