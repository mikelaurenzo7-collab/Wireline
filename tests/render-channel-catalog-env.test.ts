import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOUNDER_PRICES } from "../scripts/lib/stripe-founder-catalog.mjs";

const blueprint = readFileSync("render.yaml", "utf8");
const api = blueprint.slice(
  blueprint.indexOf("name: botbound-api"),
  blueprint.indexOf("name: botbound-voice"),
);

describe("Render launch catalog inventory", () => {
  it("prompts for each current Calls interval without hardcoding provider identities", () => {
    const intervals = FOUNDER_PRICES.filter(
      (price) => price.recurring && price.metadata.wireline_channels === "voice",
    );
    expect(intervals).toHaveLength(6);
    for (const interval of intervals) {
      expect(api).toMatch(new RegExp(`key: ${interval.envTarget}\\s+sync: false`));
      expect(api.match(new RegExp(`key: ${interval.envTarget}\\b`, "g"))).toHaveLength(1);
    }
    expect(api).not.toMatch(/value:\s*["']?price_/);
  });

  it("does not force held managed-mailbox or SMS channels into the initial release", () => {
    expect(api).not.toMatch(
      /key: STRIPE_(?:EMAIL|VOICE_EMAIL|SMS|VOICE_SMS|EMAIL_SMS|OMNICHANNEL)(?:_REGULAR|_HIGH)?_(?:ANNUAL_)?PRICE_ID/,
    );
  });
});
