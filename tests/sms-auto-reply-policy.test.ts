import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  inboundAutoReplyBody,
  shouldAnswerLatestInbound,
  smsAutoReplyEnabled,
} from "../src/lib/sms-auto-reply-policy";

describe("inbound SMS automation admission", () => {
  it("requires an explicit opt-in and rejects malformed preference data", () => {
    expect(smsAutoReplyEnabled(undefined, "+17736949780")).toBe(false);
    expect(smsAutoReplyEnabled({ sms_auto_reply: { enabled: true } }, "+17736949780")).toBe(false);
    expect(
      smsAutoReplyEnabled({ sms_auto_reply: { enabledNumbers: ["invalid"] } }, "+17736949780"),
    ).toBe(false);
    expect(
      smsAutoReplyEnabled({ sms_auto_reply: { enabledNumbers: ["+17736949780"] } }, "+17736949780"),
    ).toBe(true);
    expect(
      smsAutoReplyEnabled({ sms_auto_reply: { enabledNumbers: ["+17736949780"] } }, "+13125550121"),
    ).toBe(false);
  });

  it("does not answer an old inbound text after a customer follow-up or owner reply", () => {
    const base = {
      expectedMessageId: "51",
      receivedAt: new Date("2026-11-23T21:55:00Z"),
      now: new Date("2026-11-23T21:56:00Z"),
    };
    expect(
      shouldAnswerLatestInbound({ ...base, latestMessageId: "51", latestDirection: "in" }),
    ).toBe(true);
    expect(
      shouldAnswerLatestInbound({ ...base, latestMessageId: "52", latestDirection: "in" }),
    ).toBe(false);
    expect(
      shouldAnswerLatestInbound({ ...base, latestMessageId: "52", latestDirection: "out" }),
    ).toBe(false);
    expect(
      shouldAnswerLatestInbound({ ...base, latestMessageId: "51", latestDirection: "out" }),
    ).toBe(false);
  });

  it("does not send a delayed or future-dated reply", () => {
    const base = {
      expectedMessageId: "51",
      latestMessageId: "51",
      latestDirection: "in",
      receivedAt: new Date("2026-11-23T21:55:00Z"),
    };
    expect(shouldAnswerLatestInbound({ ...base, now: new Date("2026-11-23T22:55:01Z") })).toBe(
      false,
    );
    expect(shouldAnswerLatestInbound({ ...base, now: new Date("2026-11-23T21:54:59Z") })).toBe(
      false,
    );
  });

  it("discloses rates, frequency, STOP and HELP on the first automated response", () => {
    const body = inboundAutoReplyBody("What can we help you with?", true);
    expect(body).toContain("Message frequency varies.");
    expect(body).toContain("Message and data rates may apply.");
    expect(body).toContain("Reply STOP to opt out or HELP for help.");
    expect(inboundAutoReplyBody("Thanks for the details.", false)).toBe("Thanks for the details.");
  });
});

describe("opt-outs never get an automated reply", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("queues nothing in the base webhook's opt-out branch, and classifies plain language before any queueing", () => {
    const base = read("src/routes/twilio-webhook-base.ts");
    const optOutBlock = base.slice(base.indexOf("if (isOptOut)"), base.indexOf("if (isOptIn)"));
    expect(optOutBlock).toContain("persistInboundSmsEvidence");
    expect(optOutBlock).not.toContain("queueAutoReply");
    expect(base.indexOf("isPlainLanguageOptOut(trimmed)")).toBeLessThan(
      base.indexOf("queueAutoReply:"),
    );
  });

  it("queues in this route only for a plain START-type word, never for a stop control", () => {
    const route = read("src/routes/twilio-webhook.ts");
    expect(route.match(/queueAutoReply:/g)).toHaveLength(1);
    const startBranch = route.slice(
      route.indexOf('if (input.control === "start" && input.legacy)'),
      route.indexOf('if (input.control === "stop") {'),
    );
    expect(startBranch).toContain("queueAutoReply:");
    // A plain-language opt-out resolves to the stop control, which has no queueing site.
    const resolver = route.slice(
      route.indexOf("function resolveConsentControl"),
      route.indexOf("async function persistConsentControl"),
    );
    expect(resolver).toContain("isPlainLanguageOptOut(bodyKeyword)");
    expect(resolver).toContain('{ control: "stop", legacy: true }');
  });
});
