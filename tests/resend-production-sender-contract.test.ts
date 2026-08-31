import { afterEach, describe, expect, it } from "vitest";

import {
  getResendTransportDiagnostics,
  resolveResendFromAddress,
} from "../src/lib/resend-config";

const ORIGINAL_ENV = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  RESEND_FROM_DOMAIN: process.env.RESEND_FROM_DOMAIN,
};

function restore(name: keyof typeof ORIGINAL_ENV): void {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("VERCEL_ENV");
  restore("RESEND_FROM_EMAIL");
  restore("RESEND_FROM_DOMAIN");
});

describe("Resend production sender identity", () => {
  it("overrides the retired Wireline sender in Production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.RESEND_FROM_EMAIL = "Wireline <noreply@trywireline.com>";
    delete process.env.RESEND_FROM_DOMAIN;

    expect(resolveResendFromAddress()).toBe("BotBound <noreply@botbound.me>");
    expect(getResendTransportDiagnostics().production_sender_overridden).toBe(true);
  });

  it("allows the canonical BotBound domain and its subdomains in Production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.RESEND_FROM_EMAIL = "BotBound Alerts <alerts@mail.botbound.me>";
    delete process.env.RESEND_FROM_DOMAIN;

    expect(resolveResendFromAddress()).toBe("BotBound Alerts <alerts@mail.botbound.me>");
    expect(getResendTransportDiagnostics().production_sender_overridden).toBe(false);
  });

  it("preserves sandbox sender flexibility outside Production", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.RESEND_FROM_EMAIL = "BotBound Preview <preview@example.test>";
    delete process.env.RESEND_FROM_DOMAIN;

    expect(resolveResendFromAddress()).toBe("BotBound Preview <preview@example.test>");
  });
});
