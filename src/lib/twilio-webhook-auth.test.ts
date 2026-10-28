import type { Request } from "express";
import Twilio from "twilio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateTwilioWebhookAuth } from "./twilio-webhook-auth";

const AUTH_TOKEN = "twilio-auth-token-for-origin-binding";
const ACCOUNT_SID = "AC11111111111111111111111111111111";
const BODY = { AccountSid: ACCOUNT_SID, Body: "STOP", From: "+14155550100" };

function requestFor(url: string, signedUrl = url, host = new URL(url).host, body = BODY): Request {
  const parsed = new URL(url);
  return {
    method: "POST",
    originalUrl: `${parsed.pathname}${parsed.search}`,
    protocol: "https",
    headers: {
      host,
      "x-forwarded-host": host,
      "x-twilio-signature": Twilio.getExpectedTwilioSignature(AUTH_TOKEN, signedUrl, body),
    },
    body,
  } as unknown as Request;
}

describe("Twilio webhook external-origin binding", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_URL", "https://botbound.app");
    vi.stubEnv("TWILIO_ACCOUNT_SID", ACCOUNT_SID);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_WEBHOOK_BASE_URL", "");
    vi.stubEnv("TWILIO_WEBHOOK_DISABLE_AUTH", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "https://botbound.app/api/twilio-webhook/sms?scope=operational&attempt=1",
    "https://botbound.me/api/twilio-webhook/sms?scope=operational&attempt=1",
    "https://trywireline.com/api/twilio-webhook/sms?scope=operational&attempt=1",
  ])("accepts an authentic signature only on its exact allowed host: %s", (url) => {
    expect(evaluateTwilioWebhookAuth(requestFor(url), AUTH_TOKEN)).toEqual({ ok: true });
  });

  it("binds system-owned callback scope to the signed query", () => {
    const system =
      "https://botbound.app/api/twilio-webhook/message-status?scope=operational-system";
    const tenant = "https://botbound.app/api/twilio-webhook/message-status?scope=operational";

    expect(evaluateTwilioWebhookAuth(requestFor(system), AUTH_TOKEN)).toEqual({ ok: true });
    expect(evaluateTwilioWebhookAuth(requestFor(tenant, system), AUTH_TOKEN)).toEqual({
      ok: false,
    });
    expect(evaluateTwilioWebhookAuth(requestFor(system, tenant), AUTH_TOKEN)).toEqual({
      ok: false,
    });
  });

  it.each(["https://botbound.me", "https://trywireline.com"])(
    "rejects signatures crossed with the legacy host %s",
    (legacyOrigin) => {
      const canonical = "https://botbound.app/api/twilio-webhook/sms";
      const legacy = `${legacyOrigin}/api/twilio-webhook/sms`;

      expect(
        evaluateTwilioWebhookAuth(requestFor(canonical, legacy, "botbound.app"), AUTH_TOKEN),
      ).toEqual({ ok: false });
      expect(evaluateTwilioWebhookAuth(requestFor(legacy, canonical), AUTH_TOKEN)).toEqual({
        ok: false,
      });
    },
  );

  it("fails closed for unknown hosts, malformed targets, account mismatch, and non-POST requests", () => {
    const url = "https://botbound.app/api/twilio-webhook/sms";
    expect(evaluateTwilioWebhookAuth(requestFor(url, url, "attacker.example"), AUTH_TOKEN)).toEqual(
      { ok: false },
    );

    const malformed = requestFor(url);
    malformed.originalUrl = "//attacker.example/api/twilio-webhook/sms";
    expect(evaluateTwilioWebhookAuth(malformed, AUTH_TOKEN)).toEqual({ ok: false });

    const mismatchedBody = { ...BODY, AccountSid: "AC22222222222222222222222222222222" };
    const mismatchedAccount = requestFor(url, url, "botbound.app", mismatchedBody);
    expect(evaluateTwilioWebhookAuth(mismatchedAccount, AUTH_TOKEN)).toEqual({ ok: false });

    const getRequest = requestFor(url);
    getRequest.method = "GET";
    expect(evaluateTwilioWebhookAuth(getRequest, AUTH_TOKEN)).toEqual({ ok: false });
  });

  it("uses an explicit canonical base when a trusted proxy obscures the public host", () => {
    vi.stubEnv("TWILIO_WEBHOOK_BASE_URL", "https://botbound.app");
    const url = "https://botbound.app/api/twilio-webhook/sms?scope=operational";

    expect(evaluateTwilioWebhookAuth(requestFor(url, url, "internal.proxy"), AUTH_TOKEN)).toEqual({
      ok: true,
    });
  });

  it("fails closed when the auth token is missing even outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    const url = "https://botbound.app/api/twilio-webhook/sms";

    expect(evaluateTwilioWebhookAuth(requestFor(url), undefined)).toEqual({ ok: false });
  });

  it("allows an explicit dev-only bypass only outside production", () => {
    const url = "https://botbound.app/api/twilio-webhook/sms";

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TWILIO_WEBHOOK_DISABLE_AUTH", "1");
    expect(evaluateTwilioWebhookAuth(requestFor(url), undefined)).toEqual({ ok: true });

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    expect(evaluateTwilioWebhookAuth(requestFor(url), undefined)).toEqual({ ok: false });
  });
});
