import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { Request } from "express";
import { vapiWebhookSecretOk } from "./vapi-webhook-auth";

function reqWithSecret(secret?: string): Request {
  return {
    headers: secret ? { "x-vapi-secret": secret } : {},
  } as Request;
}

describe("vapiWebhookSecretOk", () => {
  const prevSecret = process.env.VAPI_WEBHOOK_SECRET;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;

  beforeEach(() => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env.VAPI_WEBHOOK_SECRET = prevSecret;
    process.env.NODE_ENV = prevNodeEnv;
    process.env.VERCEL = prevVercel;
  });

  it("allows requests when secret is unset in non-production", () => {
    expect(vapiWebhookSecretOk(reqWithSecret())).toBe(true);
  });

  it("rejects when secret is unset in production", () => {
    process.env.NODE_ENV = "production";
    expect(vapiWebhookSecretOk(reqWithSecret())).toBe(false);
  });

  it("accepts matching secret", () => {
    process.env.VAPI_WEBHOOK_SECRET = "test-vapi-secret-value";
    expect(vapiWebhookSecretOk(reqWithSecret("test-vapi-secret-value"))).toBe(true);
  });

  it("rejects wrong secret", () => {
    process.env.VAPI_WEBHOOK_SECRET = "expected-secret";
    expect(vapiWebhookSecretOk(reqWithSecret("wrong-secret"))).toBe(false);
  });
});
