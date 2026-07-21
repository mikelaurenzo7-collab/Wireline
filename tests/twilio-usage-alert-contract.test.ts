import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Twilio usage alert contract", () => {
  it("authenticates, durably deduplicates, and reports account spend thresholds", () => {
    const route = read("src/routes/twilio-webhook.ts");
    const idempotency = read("src/lib/twilio-usage-alert-idempotency.ts");

    expect(route).toContain("/api/twilio-webhook/usage-alert");
    expect(route).toContain("evaluateTwilioWebhookAuth(req)");
    expect(route).toContain("IdempotencyToken");
    expect(route).toContain("claimTwilioUsageAlert");
    expect(route).toContain("OPS_ALERT_EMAIL");
    expect(route).not.toContain("twilioCallbackRateLimiter");
    expect(read("src/routes/twilio-webhook-base.ts")).not.toContain(
      'router.post("/api/twilio-webhook/sms", twilio',
    );
    expect(idempotency).toContain("nx: true");
    expect(idempotency).toContain('return "unavailable"');
  });

  it("reads Usage Triggers from Twilio's account Usage API", () => {
    const launchStatus = read("scripts/generate-launch-status.mjs");
    expect(launchStatus).toContain("/Usage/Triggers.json?PageSize=100");
    expect(launchStatus).not.toContain("monitor.twilio.com/v1/Monitors/UsageTriggers");
  });
});
