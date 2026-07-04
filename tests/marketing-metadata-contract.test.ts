import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("marketing metadata contract", () => {
  it("keeps static and runtime fallback metadata aligned to the agent story", () => {
    const staticHead = read("index.html");
    const runtimeMeta = read("src/lib/page-meta.tsx");

    expect(staticHead).toContain("Wireline — Wire your agent.");
    expect(runtimeMeta).toContain('const DEFAULT_TITLE = "Wireline - Wire your agent"');
    expect(staticHead).toContain("solo business agents");
    expect(runtimeMeta).toContain("solo business agents");
    expect(runtimeMeta).not.toContain("Personal & Business AI Assistants");
  });

  it("does not hard-code plan prices into public structured data", () => {
    const staticHead = read("index.html");

    expect(staticHead).toContain('"@type":"SoftwareApplication"');
    expect(staticHead).not.toContain('"@type":"Offer"');
  });
});
