import { createHmac } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Request } from "express";
import { evaluateTwilioWebhookAuth } from "./twilio-webhook-auth";

function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

function signedReq(
  authToken: string,
  body: Record<string, string>,
  baseUrl = "https://app.wireline.ai/api/twilio-webhook/sms",
): Request {
  const signature = twilioSignature(authToken, baseUrl, body);
  return {
    protocol: "https",
    originalUrl: "/api/twilio-webhook/sms",
    headers: {
      host: "app.wireline.ai",
      "x-forwarded-proto": "https",
      "x-twilio-signature": signature,
    },
    body,
  } as Request;
}

describe("evaluateTwilioWebhookAuth", () => {
  const prevToken = process.env.TWILIO_AUTH_TOKEN;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;

  beforeEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env.TWILIO_AUTH_TOKEN = prevToken;
    process.env.NODE_ENV = prevNodeEnv;
    process.env.VERCEL = prevVercel;
    vi.restoreAllMocks();
  });

  it("allows dev traffic when TWILIO_AUTH_TOKEN is unset", () => {
    expect(evaluateTwilioWebhookAuth({ headers: {} } as Request)).toEqual({ ok: true });
  });

  it("rejects in production when TWILIO_AUTH_TOKEN is unset", () => {
    process.env.NODE_ENV = "production";
    expect(evaluateTwilioWebhookAuth({ headers: {} } as Request)).toEqual({ ok: false });
  });

  it("accepts a valid Twilio signature", () => {
    const token = "test-twilio-auth-token";
    const body = { From: "+15551234567", To: "+15559876543", Body: "STOP" };
    expect(evaluateTwilioWebhookAuth(signedReq(token, body), token)).toEqual({ ok: true });
  });

  it("rejects a bad signature", () => {
    const token = "test-twilio-auth-token";
    const req = signedReq(token, { From: "+1", To: "+2", Body: "hi" });
    req.headers["x-twilio-signature"] = "invalid";
    expect(evaluateTwilioWebhookAuth(req, token)).toEqual({ ok: false });
  });
});
