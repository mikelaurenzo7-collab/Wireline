import { describe, expect, it } from "vitest";
import {
  isStaleBotBoundPricing,
  withoutStaleBotBoundPricing,
} from "../src/lib/usage-billing-catalog";

describe("saved BotBound pricing scope", () => {
  it.each([
    "Our maintenance membership is $19/month.",
    "Haircuts start from $19.",
    "Our inspection starts at $190.",
    "The installation starts at $1900.",
    "BotBound takes our calls. Our membership is $19 per month.",
    "BotBound Starter is $190/month.",
    "BotBound Starter is $19.99/month.",
    "BotBound Starter is $24/month.",
  ])("preserves unrelated or current prices: %s", (text) => {
    expect(isStaleBotBoundPricing(text)).toBe(false);
    expect(withoutStaleBotBoundPricing(text)).toBe(text);
  });

  it.each([
    "BotBound Starter is $19/month.",
    "BotBound Calls plan is $19/mo.",
    "BotBound is $19 per month.",
    "BotBound is $19 a month.",
    "BotBound starts at $19.",
    "BotBound plans from $19.",
    "Wireline Starter is $190/year.",
    "BOTBOUND STARTER IS $19/MONTH.",
  ])("removes an identifiable retired platform offer: %s", (text) => {
    expect(isStaleBotBoundPricing(text)).toBe(true);
    expect(withoutStaleBotBoundPricing(text)).toBe("");
  });

  it("keeps business instructions and prices around a retired platform offer", () => {
    const text =
      "Our plan is $19/month. BotBound Starter is $19/month. Call the owner for refunds.";
    expect(withoutStaleBotBoundPricing(text)).toBe(
      "Our plan is $19/month.\nCall the owner for refunds.",
    );
  });
});
