import { describe, expect, it } from "vitest";
import { inboundAutoReplyBody, shouldAnswerLatestInbound, smsAutoReplyEnabled } from "../src/lib/sms-auto-reply-policy";

describe("inbound SMS automation admission", () => {
  it("requires an explicit opt-in and rejects malformed preference data", () => {
    expect(smsAutoReplyEnabled(undefined, "+17736949780")).toBe(false);
    expect(smsAutoReplyEnabled({ sms_auto_reply: { enabled: true } }, "+17736949780")).toBe(false);
    expect(smsAutoReplyEnabled({ sms_auto_reply: { enabledNumbers: ["invalid"] } }, "+17736949780")).toBe(false);
    expect(smsAutoReplyEnabled({ sms_auto_reply: { enabledNumbers: ["+17736949780"] } }, "+17736949780")).toBe(true);
    expect(smsAutoReplyEnabled({ sms_auto_reply: { enabledNumbers: ["+17736949780"] } }, "+13125550121")).toBe(false);
  });

  it("does not answer an old inbound text after a customer follow-up or owner reply", () => {
    const base = {
      expectedMessageId: "51",
      receivedAt: new Date("2026-11-23T21:55:00Z"),
      now: new Date("2026-11-23T21:56:00Z"),
    };
    expect(shouldAnswerLatestInbound({ ...base, latestMessageId: "51", latestDirection: "in" }))
      .toBe(true);
    expect(shouldAnswerLatestInbound({ ...base, latestMessageId: "52", latestDirection: "in" }))
      .toBe(false);
    expect(shouldAnswerLatestInbound({ ...base, latestMessageId: "52", latestDirection: "out" }))
      .toBe(false);
    expect(shouldAnswerLatestInbound({ ...base, latestMessageId: "51", latestDirection: "out" }))
      .toBe(false);
  });

  it("does not send a delayed or future-dated reply", () => {
    const base = {
      expectedMessageId: "51", latestMessageId: "51", latestDirection: "in",
      receivedAt: new Date("2026-11-23T21:55:00Z"),
    };
    expect(shouldAnswerLatestInbound({ ...base, now: new Date("2026-11-23T22:55:01Z") }))
      .toBe(false);
    expect(shouldAnswerLatestInbound({ ...base, now: new Date("2026-11-23T21:54:59Z") }))
      .toBe(false);
  });

  it("discloses rates, frequency, STOP and HELP on the first automated response", () => {
    const body = inboundAutoReplyBody("What can we help you with?", true);
    expect(body).toContain("Message frequency varies.");
    expect(body).toContain("Message and data rates may apply.");
    expect(body).toContain("Reply STOP to opt out or HELP for help.");
    expect(inboundAutoReplyBody("Thanks for the details.", false)).toBe("Thanks for the details.");
  });
});
