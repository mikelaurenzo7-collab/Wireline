import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "MarketingPageFrame.tsx"), "utf8");

describe("MarketingPageFrame structure", () => {
  it("supports an on-page section rail for public-page wayfinding", () => {
    expect(src).toContain("sectionLinks");
    expect(src).toContain('aria-label="On this page"');
    expect(src).toContain("href={`#${link.id}`}");
  });
});
