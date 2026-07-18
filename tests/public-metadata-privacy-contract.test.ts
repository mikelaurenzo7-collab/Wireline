import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const indexHtml = read("index.html");
const humans = read("public/humans.txt");

describe("public metadata privacy contract", () => {
  it("publishes the company rather than personal founder identity", () => {
    expect(indexHtml).not.toContain('"founder"');
    expect(indexHtml).not.toContain('"@type": "Person"');
    expect(humans).toContain("Team: Wireline");
    expect(humans).not.toMatch(/Founder\s*&\s*Engineer:/i);
  });

  it("does not publish a direct support telephone number in structured data", () => {
    expect(indexHtml).not.toContain('"telephone"');
    expect(indexHtml).not.toContain('"contactPoint"');
  });
});
