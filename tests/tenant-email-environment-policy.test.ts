import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const policy = vi.hoisted(() => vi.fn());
const deliverySuppressed = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: policy,
}));
vi.mock("../src/lib/email-delivery-suppression", () => ({
  isProviderDeliverySuppressed: deliverySuppressed,
}));

import {
  sendPaymentFailedEmail,
  sendTenantEmail,
  sendTrialEndingSoonEmail,
  sendUrgentEscalationEmail,
} from "../src/lib/email-service";

describe("tenant email account-environment policy", () => {
  const priorResendKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    policy.mockReset();
    policy.mockResolvedValue({
      allowed: false,
      environment: "demo",
      status: 403,
      code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
      message: "Live external actions are disabled in this demo or test workspace.",
    });
    deliverySuppressed.mockReset();
    deliverySuppressed.mockResolvedValue(false);
    process.env.RESEND_API_KEY = "re_test_key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (priorResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorResendKey;
  });

  it("suppresses generic tenant mail without reaching Resend", async () => {
    await expect(
      sendTenantEmail({
        userId: "demo-user",
        action: "test_notification",
        to: "owner@example.com",
        subject: "Test",
        text: "Test",
        html: "<p>Test</p>",
      }),
    ).resolves.toMatchObject({ ok: false, disposition: "suppressed" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("suppresses a demo voicemail owner notification before provider transport", async () => {
    await expect(
      sendTenantEmail({
        userId: "demo-user",
        action: "voicemail_failover_owner_notification",
        to: "owner@example.com",
        subject: "BotBound: voicemail left during call failover",
        text: "A caller left a voicemail.",
        html: "<p>A caller left a voicemail.</p>",
      }),
    ).resolves.toMatchObject({ ok: false, disposition: "suppressed" });
    expect(policy).toHaveBeenCalledWith("demo-user");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("suppresses every tenant-specific direct Resend template before transport", async () => {
    const results = await Promise.all([
      sendUrgentEscalationEmail({
        userId: "demo-user",
        to: "owner@example.com",
        title: "Urgent",
        message: "Call back",
      }),
      sendPaymentFailedEmail({
        userId: "demo-user",
        to: "owner@example.com",
        amountDisplay: "$10.00",
        updateCardUrl: "https://botbound.me/settings/billing",
      }),
      sendTrialEndingSoonEmail({
        userId: "demo-user",
        to: "owner@example.com",
        daysLeft: 3,
        checkoutUrl: "https://botbound.me/pricing",
      }),
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.disposition === "suppressed")).toBe(true);
    expect(policy).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves production tenant delivery through the same boundary", async () => {
    policy.mockResolvedValueOnce({ allowed: true, environment: "production" });
    const provider = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    vi.stubGlobal("fetch", provider);

    await expect(
      sendTenantEmail({
        userId: "production-user",
        action: "owner_notification",
        to: "owner@example.com",
        subject: "Test",
        text: "Test",
        html: "<p>Test</p>",
      }),
    ).resolves.toMatchObject({ ok: true, disposition: "accepted", id: "email-1" });
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
