import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  XAI_OUTCOME_AMBIGUOUS,
  buildXAIPhoneRegistrationBody,
  isAmbiguousXAIRegistrationStatus,
  parseXAIPhoneRegistrationPayload,
} from "../src/lib/voice/xai-sip-provisioning";
import { verifyXAIWebhook } from "../src/lib/voice/xai-webhook-auth";

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
