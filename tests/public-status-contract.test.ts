import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const statusSource = readFileSync("src/components/Status.tsx", "utf8");

describe("public status settling contract", () => {
  it("bounds the live probe and exposes its busy state to assistive tech and visual QA", () => {
    expect(statusSource).toContain("new AbortController()");
    expect(statusSource).toContain("controller.abort(), 8_000");
    expect(statusSource).toContain("signal: controller.signal");
    expect(statusSource).toContain("aria-busy={loading}");
    expect(statusSource).toContain('aria-live="polite"');
  });
});
