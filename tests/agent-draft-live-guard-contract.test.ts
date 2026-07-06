import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("agent draft live guard contract", () => {
  it("blocks draft mutations when agent has a phone line", () => {
    const source = read("src/lib/agent-draft-service.ts");
    expect(source).toContain("phoneNumbers");
    expect(source).toMatch(/live on the phone network/);
  });
});
