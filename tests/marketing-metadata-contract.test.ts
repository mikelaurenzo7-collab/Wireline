import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const positioning = "Agents for calls, texts, and follow-up";
const stalePositioning = "Personal & Business AI Assistants";

describe("marketing metadata contract", () => {
  it("keeps static and runtime fallback metadata aligned to the product positioning", () => {
    const staticHead = read("index.html");
    const runtimeMeta = read("src/lib/page-meta.tsx");

    expect(staticHead).toContain(`Wireline - ${positioning}`);
    expect(runtimeMeta).toContain(`const DEFAULT_TITLE = "Wireline - ${positioning}"`);
    expect(runtimeMeta).toContain(
      "create, train, and run agents for calls, texts, follow-up, browser context, email, and integrations",
    );
    expect(runtimeMeta).not.toContain(stalePositioning);
  });

  it("does not hard-code plan prices into public structured data", () => {
    const staticHead = read("index.html");

    expect(staticHead).toContain('"@type":"SoftwareApplication"');
    expect(staticHead).not.toContain('"@type":"Offer"');
  });
});
