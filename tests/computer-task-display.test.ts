import { describe, expect, it } from "vitest";
import { shortComputerTaskLabel } from "../src/lib/computer-task-display";

describe("browser task display labels", () => {
  it("keeps a short brief and normalizes only its display whitespace", () => {
    expect(shortComputerTaskLabel("  Read\n the public listing.  ")).toBe(
      "Read the public listing.",
    );
  });

  it("bounds long labels at a word boundary without changing the original brief", () => {
    const brief =
      "Compare public providers and summarize the available appointments and prices. ".repeat(20);
    const label = shortComputerTaskLabel(brief);
    expect(Array.from(label).length).toBeLessThanOrEqual(80);
    expect(label).toMatch(/\S…$/);
    expect(brief.startsWith(label.slice(0, -1))).toBe(true);
    expect(brief.length).toBeGreaterThan(1000);
  });

  it("bounds unbroken and Unicode labels without splitting surrogate pairs", () => {
    const label = shortComputerTaskLabel("🧭".repeat(120));
    expect(label).toBe(`${"🧭".repeat(79)}…`);
    expect(shortComputerTaskLabel("x".repeat(120))).toBe(`${"x".repeat(79)}…`);
  });
});
