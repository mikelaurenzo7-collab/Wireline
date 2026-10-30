import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("retired client environment sanitizer", () => {
  it("keeps the standalone deployment boundary strict", () => {
    const boundary = read("scripts/check-deployment-boundaries.mjs");
    expect(boundary).toContain('if (value("VITE_VAPI_PUBLIC_KEY"))');
    expect(boundary).toContain("retired browser credential must be removed before production");
  });
});
