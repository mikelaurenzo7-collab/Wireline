import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/styles/authenticated-visual-qa.css"),
  "utf8",
);

describe("authenticated overview visual selectors", () => {
  it("targets the current voice-agent section labels", () => {
    expect(css).toContain('section[aria-label="Personal voice agents"]');
    expect(css).toContain('section[aria-label="Business voice agents"]');
    expect(css).not.toMatch(/section\[aria-label="(?:Personal|Business) AI employees"\]/);
  });
});
