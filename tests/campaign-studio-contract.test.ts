import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs build script.
import { buildCampaignDeliveryManifest } from "../scripts/build-campaign-delivery-manifest.mjs";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Campaign Studio", () => {
  it("keeps generated campaign assets outside the live-call runtime", async () => {
    const manifest = await buildCampaignDeliveryManifest();
    expect(manifest.audio).toHaveLength(4);
    expect(manifest.audio.every((asset) => asset.usage.includes("never live call audio"))).toBe(true);
    expect(manifest.sonicAssets.every((asset) => asset.review === "human approval required")).toBe(true);
  });

  it("keeps the post-proof and exact-production gates explicit", () => {
    const studio = read("docs/CAMPAIGN_STUDIO.md");
    expect(studio).toMatch(/Post-proof creative system/);
    expect(studio).toMatch(/exact promoted production commit/);
    expect(studio).toMatch(/Never imitate a public figure/i);
    expect(read("docs/README.md")).toContain("CAMPAIGN_STUDIO.md");
  });
});
