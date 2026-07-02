import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_VOICE } from "../src/lib/product-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product voice cohesion", () => {
  it("keeps marketing hero strings in one shared module", () => {
    expect(MARKETING_VOICE.headline).toBe("Wire your agent.");
    expect(MARKETING_VOICE.subline).toContain("personal assistants");
    expect(MARKETING_VOICE.subline).toContain("solo business agents");
    expect(MARKETING_VOICE.subline).toContain("call centers");
    expect(MARKETING_VOICE.subline).toContain("sales teams");
    expect(MARKETING_VOICE.proof).toEqual([
      "Personal assistants",
      "Solo business agents",
      "Teams & call centers",
    ]);
  });

  it("wires landing and workroom surfaces to shared voice constants", () => {
    const landing = read("src/components/marketing/PrecisionLanding.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const extension = read("apps/browser-extension/panel/index.html");
    expect(landing).toContain("MARKETING_VOICE");
    expect(workroom).toContain("WORKSPACE_VOICE");
    expect(extension).toContain(MARKETING_VOICE.extensionLead);
  });
});
