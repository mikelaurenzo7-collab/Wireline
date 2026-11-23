import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SMS_OPT_OUT_KEYWORDS, twilioAnswersKeyword } from "../src/lib/carrier-keywords";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// Twilio's documented defaults: https://help.twilio.com/articles/223134027.
// Found in the first live handset test (Nov 22, 2026): Twilio replied to HELP and
// STOP itself, so the app's own STOP confirmation always bounced with 21610 and
// logged a Twilio error for every unsubscribe.
describe("keywords Twilio answers on its own", () => {
  it.each([
    "STOP",
    "stopall",
    "Unsubscribe",
    "CANCEL",
    "end",
    "REVOKE",
    "optout",
    "Quit",
    "START",
    "yes",
    "UnStop",
    "HELP",
    "info",
    "  stop  ",
  ])("recognises %j", (body) => {
    expect(twilioAnswersKeyword(body)).toBe(true);
  });

  it.each([
    "STOP please",
    "stop calling me",
    "opt out",
    "opt-in",
    "support",
    "Yes please, Tuesday works",
    "Help me reschedule",
    "STOP.",
    "",
  ])("leaves %j for the application to answer", (body) => {
    expect(twilioAnswersKeyword(body)).toBe(false);
  });

  it("tolerates a missing body", () => {
    expect(twilioAnswersKeyword(undefined as unknown as string)).toBe(false);
  });
});

describe("opt-out vocabulary matches the registered campaign", () => {
  // BotBound's verified campaign registers these opt-out keywords with the carriers.
  const registered = [
    "stop",
    "stopall",
    "unsubscribe",
    "cancel",
    "end",
    "quit",
    "optout",
    "revoke",
  ];

  it("records every registered opt-out word as Do Not Contact, from one shared list", () => {
    for (const word of registered) expect(SMS_OPT_OUT_KEYWORDS.has(word), word).toBe(true);
    expect(read("src/routes/twilio-webhook.ts")).toContain(
      "const LEGACY_OPT_OUT_KEYWORDS = SMS_OPT_OUT_KEYWORDS;",
    );
    expect(read("src/routes/twilio-webhook-base.ts")).toContain(
      "const OPT_OUT_KEYWORDS = SMS_OPT_OUT_KEYWORDS;",
    );
    for (const file of ["src/routes/twilio-webhook.ts", "src/routes/twilio-webhook-base.ts"]) {
      expect(read(file), file).not.toMatch(/OPT_(?:OUT|IN)_KEYWORDS = new Set\(/);
    }
  });

  it("routes a one-word reply that is not an opt-out through the inbox, not consent", () => {
    const route = read("src/routes/twilio-webhook.ts");
    expect(route).toContain('input.control === "start" && input.legacy');
    expect(route).toContain('return "passthrough"');
  });
});
