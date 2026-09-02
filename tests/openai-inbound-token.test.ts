import { describe, expect, it } from "vitest";

import {
  issueOpenAIInboundToken,
  verifyOpenAIInboundToken,
} from "../src/lib/voice/openai-inbound-token";
import { buildOpenAIInboundSipUri } from "../src/lib/voice/openai-sip-config";

const ENV = {
  INTERNAL_JWT_SECRET: "botbound-test-secret-that-is-longer-than-thirty-two-characters",
  OPENAI_PROJECT_ID: "proj_botboundtest123",
} as NodeJS.ProcessEnv;
const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);

describe("OpenAI inbound SIP correlation token", () => {
  it("binds the signed Twilio source and both phone identities", () => {
    const issued = issueOpenAIInboundToken({
      twilioCallSid: "CA0123456789abcdef0123456789abcdef",
      calledNumber: "+13125550101",
      callerNumber: "+14155550199",
      nowMs: NOW,
      env: ENV,
    });

    expect(verifyOpenAIInboundToken(issued.token, { nowMs: NOW + 1_000, env: ENV })).toEqual({
      ok: true,
      claims: issued.claims,
    });
    expect(buildOpenAIInboundSipUri(issued.token, ENV)).toContain("X-BB-Inbound=");
    expect(buildOpenAIInboundSipUri(issued.token, ENV).length).toBeLessThanOrEqual(255);
  });

  it("rejects tampering, expiration, and invalid Twilio identities", () => {
    const issued = issueOpenAIInboundToken({
      twilioCallSid: "CAabcdef0123456789abcdef0123456789",
      calledNumber: "+13125550101",
      nowMs: NOW,
      env: ENV,
    });
    const last = issued.token.at(-1) === "a" ? "b" : "a";
    expect(
      verifyOpenAIInboundToken(`${issued.token.slice(0, -1)}${last}`, { nowMs: NOW, env: ENV }),
    ).toMatchObject({ ok: false, reason: "invalid_signature" });
    expect(
      verifyOpenAIInboundToken(issued.token, { nowMs: NOW + 5 * 60_000 + 1_000, env: ENV }),
    ).toMatchObject({ ok: false, reason: "expired" });
    expect(() =>
      issueOpenAIInboundToken({
        twilioCallSid: "not-a-call-sid",
        calledNumber: "+13125550101",
        env: ENV,
      }),
    ).toThrow(/CallSid/);
  });
});
