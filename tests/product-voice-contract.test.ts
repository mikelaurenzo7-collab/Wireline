import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_VOICE } from "../src/lib/product-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product voice cohesion", () => {
  it("keeps marketing hero strings in one shared module", () => {
    expect(MARKETING_VOICE.headline).toBe("Your phone, finally answering for you.");
    expect(MARKETING_VOICE.subline).toContain("picks up your phone");
    expect(MARKETING_VOICE.proof).toEqual([
      "Answers with a real voice",
      "Acts on your behalf",
      "Texts you what happened",
    ]);
  });

  it("wires landing and overview surfaces to shared voice constants", () => {
    const landing = read("src/components/marketing/PrecisionLanding.tsx");
    const overview = read("src/pages/OverviewPage.tsx");
    const extension = read("apps/browser-extension/panel/index.html");
    expect(landing).toContain("MARKETING_VOICE");
    expect(overview).toContain("WORKSPACE_VOICE");
    expect(overview).toContain("wl-composer-dock");
    expect(extension).toContain(MARKETING_VOICE.extensionLead);
  });
});
