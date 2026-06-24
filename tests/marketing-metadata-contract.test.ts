import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const positioning = "Personal & Business AI Assistants";
const stalePositioning = "AI Voice & Email Agents for Every Business";

describe("marketing metadata contract", () => {
  it("keeps static and runtime fallback metadata aligned to the product positioning", () => {
    const staticHead = read("index.html");
    const runtimeMeta = read("src/lib/page-meta.tsx");

    expect(staticHead).toContain(`Wireline — ${positioning}`);
    expect(runtimeMeta).toContain(`const DEFAULT_TITLE = "Wireline — ${positioning}"`);
    expect(runtimeMeta).toContain("voice, email, and text conversations—under your rules.");
    expect(runtimeMeta).not.toContain(stalePositioning);
  });

  it("does not hard-code plan prices into public structured data", () => {
    const staticHead = read("index.html");

    expect(staticHead).toContain('"@type":"SoftwareApplication"');
    expect(staticHead).not.toContain('"@type":"Offer"');
  });
});
