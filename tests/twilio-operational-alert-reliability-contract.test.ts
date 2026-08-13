import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Twilio operational alert reliability contract", () => {
  it("routes tenant, manager, per-agent, and platform messages through bounded 429 retry", () => {
    const tenantMessaging = read("src/lib/twilio-service.ts");
    const operationalMessaging = read("src/lib/twilio-service-base.ts");

    expect(tenantMessaging).toContain("createTwilioMessageWithRateLimitRetry(");
    expect(operationalMessaging.match(/createTwilioMessageWithRateLimitRetry\(/g)).toHaveLength(3);
    expect(operationalMessaging).toContain("sendPlatformOperationalAlert");
    expect(operationalMessaging).toContain("withTwilioMessageReliability");
  });

  it("correlates staff alerts without creating customer conversation threads", () => {
    const operationalMessaging = read("src/lib/twilio-service-base.ts");
    const escalation = read("src/routes/escalation-routes.ts");

    expect(operationalMessaging).toContain("persistOperationalAlertCorrelation");
    expect(operationalMessaging).toContain("threadId: null");
    expect(operationalMessaging).toContain('body: "[Operational alert delivery correlation]"');
    expect(operationalMessaging).toContain('{ scope: "operational" }');
    expect(operationalMessaging).toContain(".onConflictDoNothing()");
    expect(escalation).toContain("sendPlatformOperationalAlert(");
    expect(escalation).not.toContain("client.messages.create");
  });

  it("records and reports carrier failures for correlated and unattributed staff alerts", () => {
    const webhook = read("src/routes/twilio-webhook.ts");

    expect(webhook).toContain(
      'provider: operationalAlert ? "twilio_operational" : "twilio_messaging"',
    );
    expect(webhook).toContain("Twilio operational SMS delivery failed after provider acceptance");
    expect(webhook).toContain("Unattributed Twilio operational SMS delivery failed");
    expect(webhook).toContain('provider: "twilio_operational"');
    expect(webhook).toContain('const operationalCallback = req.query.scope === "operational"');
    expect(webhook).toContain("else if (operationalCallback && deliveryFailed)");
  });
});
