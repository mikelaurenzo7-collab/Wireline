import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/marketing/PrecisionPublicHeader.tsx"),
  "utf8",
);

describe("minimal public header mobile contract", () => {
  it("keeps both account actions visible without allowing flex children to escape", () => {
    expect(source).toContain('aria-label="Account"');
    expect(source).toContain("min-w-0");
    expect(source).toContain("shrink-0");
    expect(source).toContain("whitespace-nowrap");
    expect(source).toContain("Sign In");
    expect(source).toContain("Start Free");
  });

  it("does not reintroduce the retired brochure navigation drawer", () => {
    expect(source).not.toMatch(/Menu|wireline-mobile-navigation|aria-label="Site"/);
  });
});
