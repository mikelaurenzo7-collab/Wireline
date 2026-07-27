import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("launch polish audit contract", () => {
  it("keeps the active showcase on the customer-facing Runtime Balance name", () => {
    const showcase = read("docs/PRODUCT_SHOWCASE_MATRIX.md");
    expect(showcase).toContain("Runtime Balance");
    expect(showcase).not.toContain("included voice + Conversation Balance");
    expect(showcase).not.toContain("Conversation Balance, audit spend");
    expect(showcase).not.toContain("Included capacity + Conversation Balance");
  });
});
