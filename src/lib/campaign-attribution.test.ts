import { describe, expect, it } from "vitest";
import {
  campaignAttributionFromSearchParams,
  campaignAttributionLines,
  cleanCampaignAttribution,
} from "./campaign-attribution";

describe("demo request campaign attribution", () => {
  it("preserves four campaign labels without copying unrelated query fields", () => {
    const attribution = campaignAttributionFromSearchParams(
      new URLSearchParams(
        "utm_source=google&utm_medium=paid_search&utm_campaign=missed_call_pilot&utm_content=call_demo_a&email=visitor%40example.com",
      ),
    );
    expect(campaignAttributionLines(attribution)).toEqual([
      "utm_source: google",
      "utm_medium: paid_search",
      "utm_campaign: missed_call_pilot",
      "utm_content: call_demo_a",
    ]);
    expect(attribution).not.toHaveProperty("email");
  });

  it("drops oversized, multi-line, and email-like values without rejecting the inquiry", () => {
    expect(
      cleanCampaignAttribution({
        utm_source: "google\nBcc: other@example.com",
        utm_medium: "paid_search",
        utm_campaign: "x".repeat(121),
        utm_content: "visitor@example.com",
        untrusted: "ignored",
      }),
    ).toEqual({ utm_medium: "paid_search" });
    expect(campaignAttributionLines(["unexpected"])).toEqual([]);
  });
});
