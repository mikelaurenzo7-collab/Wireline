import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("verified launch-readiness wins", () => {
  it("ends spoken DNC opt-outs through OpenAI live-call control and waits for confirmation", () => {
    const sentinel = read("src/services/sentinel.ts");
    const handlers = read("src/lib/bot-tools/core.ts");

    expect(sentinel).toContain('if (!value.startsWith("openai:")) return null');
    expect(sentinel).toContain("await hangupOpenAISipCall(providerCallId)");
    expect(sentinel).toContain('set({ status: "terminated" })');

    const dnc = handlers.slice(handlers.indexOf('fn === "add_to_dnc"'));
    // Awaited, so the tool result cannot claim termination before the provider
    // confirms it — and tenant-scoped, because a DNC list is per-tenant and the
    // unscoped lookup killed other workspaces' live calls to the same number.
    expect(dnc).toContain(
      "await sentinel.terminateActiveCallsForNumber(normalizedPhone, agent?.user_id)",
    );
    expect(dnc).toContain("End this conversation immediately.");
    expect(dnc).not.toContain("void sentinel.terminateActiveCallsForNumber");

    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(session).toContain("endForCallerDnc");
    expect(session).toContain('optOut.kind === "dnc"');
    expect(session).toContain('endedReason = "caller-dnc"');
  });

  it("does not promise caller follow-up work that was never persisted", () => {
    const handlers = read("src/lib/bot-tools/core.ts");
    expect(handlers).not.toContain(
      "I've noted that down. I'll make sure the team follows up with you.",
    );
    expect(handlers).not.toContain(
      "I wasn't able to verify that number right now, but I've noted it down.",
    );
    expect(handlers).toContain("I've logged the request for human follow-up.");
    expect(handlers).toContain("recordCommsFollowUpTask");
  });

  it("retires the public singing route before any paid carrier bridging", () => {
    const twilio = read("src/routes/twilio-webhook-base.ts");
    const start = twilio.indexOf("/api/twilio-webhook/singing-receptionist");
    const block = twilio.slice(start);

    expect(block).toContain("verifyTwilioSignature(req)");
    expect(block).toContain("return res.status(200).send(twimlHangup())");
    expect(block).not.toMatch(/<Dial\b|<Sip\b|<Say\b|timeLimit=/);
  });

  it("limits public intake before any database-backed key resolution", () => {
    const intake = read("src/routes/intake-routes.ts");
    expect(intake).toContain('bucket: "public_intake_pre_auth"');

    const oneStart = intake.indexOf('router.post("/lead"');
    const bulkStart = intake.indexOf('router.post("/leads"');
    const one = intake.slice(oneStart, bulkStart);
    const bulk = intake.slice(bulkStart);
    for (const block of [one, bulk]) {
      expect(block.indexOf("checkIntakePreAuthRate(req)")).toBeGreaterThan(-1);
      expect(block.indexOf("resolveIntakeKey(provided)")).toBeGreaterThan(
        block.indexOf("checkIntakePreAuthRate(req)"),
      );
    }
  });

  it("makes transient SMS persistence failures retryable at the carrier", () => {
    const provisioning = read("src/lib/voice/native-phone-carrier.ts");
    const readiness = read("scripts/check-vendor-readiness.mjs");
    const twilio = read("src/routes/twilio-webhook-base.ts");

    expect(provisioning).toContain("rp=5xx,ct,rt");
    expect(provisioning).toContain("tt=15000");
    expect(readiness).toContain('"twilio_sms_webhook_retries"');
    expect(twilio).toContain("await drizzle.transaction(async (tx)");
    expect(twilio).toContain("Inbound SMS persist failed, requesting Twilio redelivery");
    expect(twilio).toContain("return res.status(503).send(twimlEmpty())");
  });

  it("turns terminal Google refresh failures into visible reconnect state", () => {
    const integrations = read("src/lib/integrations.ts");
    const health = read("src/lib/integration-health.ts");

    expect(integrations).toContain('oauthCode === "invalid_grant"');
    expect(integrations).toContain("token has been expired or revoked");
    expect(integrations).toMatch(
      /set\(\{ accessToken: null, refreshToken: null, expiresAt: BigInt\(0\) \}\)/,
    );
    expect(health).toContain(
      "Google mailbox/calendar tokens were revoked, expired, or cannot refresh.",
    );
  });
});
