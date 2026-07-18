import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/recipes/RecipeModal.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("managed AI recipe availability", () => {
  it("uses the live OpenAI reasoning health signal instead of a dead provider route", () => {
    expect(source).toContain('authFetch("/api/health/public")');
    expect(source).toContain('status.components?.reasoning === "operational"');
    expect(source).not.toContain('/api/claude/status');
  });

  it("does not mislabel rate limiting or an unmounted modal as an AI outage", () => {
    expect(source).toContain("statusRes.status === 429");
    expect(source).toContain("if (cancelled) return");
    expect(source).toContain("cancelled = true");
  });
});
