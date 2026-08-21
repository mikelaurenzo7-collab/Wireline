import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/styles/authenticated-visual-qa.css"),
  "utf8",
);

describe("authenticated overview visual selectors", () => {
  it("does not revive retired audience-specific roster selectors", () => {
    expect(css).not.toMatch(/section\[aria-label="(?:Personal|Business) (?:voice agents|AI employees)"\]/);
  });
});
