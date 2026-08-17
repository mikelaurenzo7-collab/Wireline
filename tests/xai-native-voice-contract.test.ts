import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveGrokVoiceModel } from "../src/lib/voice/grok-voice-config";
import {
  XAI_OUTCOME_AMBIGUOUS,
  buildXAIPhoneRegistrationBody,
  isAmbiguousXAIRegistrationStatus,
  parseXAIPhoneRegistrationPayload,
} from "../src/lib/voice/xai-sip-provisioning";
import {
  buildXAISipRealtimeUrl,
  isValidXAISipAllowedAddress,
  resolveXAISipAllowedAddresses,
} from "../src/lib/voice/xai-sip-config";
import {
  compactXAITranscript,
  upsertOrderedCallerTranscript,
  type XAITranscriptLine,
} from "../src/lib/voice/xai-sip-session";
import { verifyXAIWebhook } from "../src/lib/voice/xai-webhook-auth";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function signingSecret(raw: Buffer): string {
  return `whsec_${raw.toString("base64")}`;
}

function signedHeaders(input: {
  secret: Buffer;
  webhookId: string;
  timestamp: number;
  body: Buffer;
}) {
  const content = Buffer.concat([
    Buffer.from(`${input.webhookId}.${input.timestamp}.`, "utf8"),
    input.body,
  ]);
  const signature = createHmac("sha256", input.secret).update(content).digest("base64");
  return {
    webhookId: input.webhookId,
    webhookTimestamp: String(input.timestamp),
    webhookSignature: `v1,${signature}`,
  };
}

describe("native Twilio + xAI voice contracts", () => {
  it("builds the documented BYO-trunk registration envelope", () => {
    const body = buildXAIPhoneRegistrationBody({
      phoneNumber: "+13125550123",
      webhookUrl: "https://trywireline.com/api/webhooks/xai/voice",
      allowedAddresses: ["54.172.60.0/23", "54.244.51.0/24"],
    });

    expect(body).toEqual({
      origin: "byo_trunk",
      name: "Wireline · +13125550123",
      phone_number: "+13125550123",
      webhook: {
        name: "Wireline voice · +13125550123",
        url: "https://trywireline.com/api/webhooks/xai/voice",
      },
      sip_auth: {
        allowed_addresses: ["54.172.60.0/23", "54.244.51.0/24"],
      },
    });
    expect(body).not.toHaveProperty("webhook_url");
  });

  it("validates every SIP allowlist entry as real IPv4/CIDR", () => {
    for (const value of ["54.172.60.0/23", "54.244.51.1", "0.0.0.0/0", "255.255.255.255/32"]) {
      expect(isValidXAISipAllowedAddress(value), value).toBe(true);
    }
    for (const value of ["999.1.1.1/24", "54.172.60.0/33", "54.172.60/23", "host.example.com"]) {
      expect(isValidXAISipAllowedAddress(value), value).toBe(false);
    }
    expect(
      resolveXAISipAllowedAddresses({ XAI_SIP_ALLOWED_ADDRESSES: "54.172.60.0/23,54.172.60.0/23 54.244.51.0/24" }),
    ).toEqual(["54.172.60.0/23", "54.244.51.0/24"]);
    expect(() =>
      resolveXAISipAllowedAddresses({ XAI_SIP_ALLOWED_ADDRESSES: "54.172.60.999/23" }),
    ).toThrow("invalid IPv4/CIDR");
  });

  it("pins production voice to a versioned Think Fast release", () => {
    expect(resolveGrokVoiceModel({})).toBe("grok-voice-think-fast-2.0");
    expect(resolveGrokVoiceModel({ XAI_GROK_VOICE_MODEL: "grok-voice-latest" })).toBe(
      "grok-voice-think-fast-2.0",
    );
    expect(resolveGrokVoiceModel({ XAI_GROK_VOICE_MODEL: "grok-voice-think-fast-3.0" })).toBe(
      "grok-voice-think-fast-3.0",
    );
    expect(resolveGrokVoiceModel({ XAI_GROK_VOICE_MODEL: "grok-4.6" })).toBe(
      "grok-voice-think-fast-2.0",
    );
  });

  it("joins SIP realtime by call id without a model query parameter", () => {
    expect(buildXAISipRealtimeUrl("call_123")).toBe(
      "wss://api.x.ai/v1/realtime?call_id=call_123",
    );
    expect(buildXAISipRealtimeUrl("  call-prod:01  ")).toBe(
      "wss://api.x.ai/v1/realtime?call_id=call-prod%3A01",
    );
    expect(() => buildXAISipRealtimeUrl("call id with spaces")).toThrow(
      "A valid xAI SIP call id is required.",
    );
  });

  it("requires every one-time registration identifier before activation", () => {
    expect(
      parseXAIPhoneRegistrationPayload({
        phone_number: { phone_number_id: "pn_xai_123" },
        webhook: {
          webhook_id: "wh_xai_123",
          dispatch_signing_secret: "whsec_secret",
        },
      }),
    ).toEqual({
      xaiPhoneNumberId: "pn_xai_123",
      xaiWebhookId: "wh_xai_123",
      dispatchSigningSecret: "whsec_secret",
    });

    expect(() =>
      parseXAIPhoneRegistrationPayload({
        phone_number_id: "pn_xai_123",
        webhook_id: "wh_xai_123",
      }),
    ).toThrow(XAI_OUTCOME_AMBIGUOUS);
  });

  it("classifies only non-idempotent/uncertain provider outcomes as ambiguous", () => {
    for (const status of [408, 409, 425, 429, 500, 502, 503]) {
      expect(isAmbiguousXAIRegistrationStatus(status), String(status)).toBe(true);
    }
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isAmbiguousXAIRegistrationStatus(status), String(status)).toBe(false);
    }
  });

  it("preserves caller/agent chronology while cumulative ASR updates correct text", () => {
    const lines: XAITranscriptLine[] = [];
    const indexes = new Map<string, number>();

    upsertOrderedCallerTranscript(lines, indexes, "caller-1", "I need a Tues");
    lines.push({ role: "Agent", text: "Certainly. Which Tuesday works?" });
    upsertOrderedCallerTranscript(lines, indexes, "caller-1", "I need a Tuesday appointment.");
    upsertOrderedCallerTranscript(lines, indexes, "caller-2", "Next Tuesday at two.");

    expect(lines).toEqual([
      { role: "Caller", text: "I need a Tuesday appointment." },
      { role: "Agent", text: "Certainly. Which Tuesday works?" },
      { role: "Caller", text: "Next Tuesday at two." },
    ]);
    expect(compactXAITranscript(lines)).toBe(
      "Caller: I need a Tuesday appointment.\n" +
        "Agent: Certainly. Which Tuesday works?\n" +
        "Caller: Next Tuesday at two.",
    );
  });

  it("delivers phone openings verbatim and waits for SIP playback before tool continuation", () => {
    const session = read("src/lib/voice/xai-sip-session.ts");
    const route = read("src/routes/xai-voice-routes.ts");

    expect(session).toContain("buildXAISipRealtimeUrl(input.callId)");
    expect(session).not.toContain("buildGrokVoiceRealtimeUrl(runtime.model)");
    expect(session).toContain('type: "force_message"');
    expect(session).toContain("interruptible: false");
    expect(session).toContain('type === "output_audio_buffer.stopped"');
    expect(session).toContain("toolContinuationPending = true");
    expect(session).toContain("requestToolContinuationWhenReady()");
    expect(route).toContain("businessName: agentContext.businessName");
    expect(route).toContain("complianceMode: agentContext.complianceMode");
  });

  it("scopes native mutating tools to the signed exact lead", () => {
    const dispatcher = read("src/lib/agent-tool-dispatch.ts");
    const nativeTools = read("src/lib/agent-tool-native-voice.ts");

    expect(dispatcher.indexOf("handleNativeVoiceToolCall")).toBeLessThan(
      dispatcher.indexOf("handleCoreToolCall"),
    );
    expect(nativeTools).toContain('call.provider !== "xai"');
    expect(nativeTools).toContain("eq(schema.outboundLeads.id, exact.leadId)");
    expect(nativeTools).toContain("eq(schema.outboundLeads.userId, context.agent.user_id)");
    expect(nativeTools).toContain("eq(schema.outboundLeads.agentId, context.agent.id)");
    expect(nativeTools).toContain("lastContactSummary: notes");
    expect(nativeTools).toContain("CALLBACK_REQUEST_MARKER");
  });

  it("reconciles stale agent assignment and mutable Twilio origination state", () => {
    const activation = read("src/lib/voice/xai-phone-activation-service.ts");
    const route = read("src/routes/xai-voice-routes.ts");

    expect(route).toContain('from "../lib/voice/xai-phone-activation-service"');
    expect(activation).toContain("binding.agentId === input.agentId");
    expect(activation).toContain("agentId: input.agentId");
    expect(activation).toContain("await collection(sid).update(payload)");
    expect(activation).toContain("enabled: true");
    expect(activation).toContain("xaiSharedTwilioOriginationUri()");
  });

  it("verifies a valid Standard Webhooks signature over the exact raw body", () => {
    const body = Buffer.from(
      JSON.stringify({ type: "realtime.call.incoming", data: { call_id: "call_123" } }),
    );
    const secret = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
    const timestamp = 1_786_966_500;
    const headers = signedHeaders({
      secret,
      webhookId: "wh_123",
      timestamp,
      body,
    });

    expect(
      verifyXAIWebhook({
        rawBody: body,
        headers,
        signingSecret: signingSecret(secret),
        nowMs: timestamp * 1_000,
      }),
    ).toEqual({ ok: true, webhookId: "wh_123", timestamp });
  });

  it("rejects tampered and expired signed webhooks", () => {
    const body = Buffer.from('{"type":"realtime.call.incoming"}', "utf8");
    const secret = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
    const timestamp = 1_786_966_500;
    const headers = signedHeaders({ secret, webhookId: "wh_123", timestamp, body });

    expect(
      verifyXAIWebhook({
        rawBody: Buffer.from('{"type":"tampered"}', "utf8"),
        headers,
        signingSecret: signingSecret(secret),
        nowMs: timestamp * 1_000,
      }),
    ).toEqual({ ok: false, reason: "invalid_signature" });

    expect(
      verifyXAIWebhook({
        rawBody: body,
        headers,
        signingSecret: signingSecret(secret),
        nowMs: (timestamp + 301) * 1_000,
      }),
    ).toEqual({ ok: false, reason: "expired" });
  });
});
