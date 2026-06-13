import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Developers external links", () => {
  it("adds noopener to every new-tab link", () => {
    const src = readFileSync(join(import.meta.dirname, "Developers.tsx"), "utf8");
    const newTabAnchors = src.match(/<a[\s\S]*?target="_blank"[\s\S]*?>/g) ?? [];

    expect(newTabAnchors.length).toBeGreaterThan(0);
    for (const anchor of newTabAnchors) {
      expect(anchor).toMatch(/rel="[^"]*\bnoopener\b[^"]*"/);
      expect(anchor).toMatch(/rel="[^"]*\bnoreferrer\b[^"]*"/);
    }
  });
});
