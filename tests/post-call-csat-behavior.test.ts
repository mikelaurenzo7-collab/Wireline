import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendTenantMessage: vi.fn(),
  info: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { info: mocks.info, warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/lib/outbound-dial-gate", () => ({
  evaluateOutboundDialGate: vi.fn(),
}));

vi.mock("../src/lib/twilio-service", () => ({
  sendTenantMessage: mocks.sendTenantMessage,
}));

vi.mock("../src/lib/vapi-helpers", () => ({
  sanitizePhone: (value: string) => value.replace(/[^0-9+]/g, ""),
}));

import { sendPreparedPostCallCsatSms } from "../src/lib/csat-service";

describe("post-call CSAT provider boundary", () => {
  beforeEach(() => {
    mocks.sendTenantMessage.mockReset();
    mocks.info.mockReset();
  });

  it("persists the at-most-once claim before the provider and adopts accepted reconciliation", async () => {
    const events: string[] = [];
    mocks.sendTenantMessage.mockImplementation(async (_userId, params) => {
      events.push("service_entered");
      await params.beforeProviderAttempt();
      events.push("provider_called");
      return {
        ok: true,
        configured: true,
        enabled: true,
        sid: "SM-accepted",
        reconciliationPending: true,
      };
    });

    const result = await sendPreparedPostCallCsatSms(
      {
        userId: "user-1",
        customerNumber: "+13125550123",
        body: "How was your call? Reply 1-5.",
      },
      {
        idempotencyKey: "post-call-csat/job-1",
        reservationAttempt: 1,
        beforeProviderAttempt: async () => {
          events.push("durable_claim");
        },
      },
    );

    expect(events).toEqual(["service_entered", "durable_claim", "provider_called"]);
    expect(mocks.sendTenantMessage).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        idempotencyKey: "post-call-csat/job-1",
        reservationAttempt: 1,
        to: "+13125550123",
      }),
    );
    expect(result).toEqual({ sent: true, providerSid: "SM-accepted" });
  });

  it("does not turn a carrier rejection into a false success", async () => {
    mocks.sendTenantMessage.mockImplementation(async (_userId, params) => {
      await params.beforeProviderAttempt();
      return {
        ok: false,
        configured: true,
        enabled: true,
        reason: "carrier rejected request",
      };
    });

    await expect(
      sendPreparedPostCallCsatSms(
        {
          userId: "user-1",
          customerNumber: "+13125550123",
          body: "How was your call? Reply 1-5.",
        },
        {
          idempotencyKey: "post-call-csat/job-1",
          reservationAttempt: 1,
          beforeProviderAttempt: async () => undefined,
        },
      ),
    ).resolves.toEqual({ sent: false, reason: "carrier rejected request" });
  });

  it("preserves an ambiguous provider outcome so the durable worker forbids replay", async () => {
    mocks.sendTenantMessage.mockImplementation(async (_userId, params) => {
      await params.beforeProviderAttempt();
      return {
        ok: false,
        configured: true,
        enabled: true,
        reason: "Delivery status is unknown. Do not resend.",
        code: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
        providerOutcomeAmbiguous: true,
        doNotResend: true,
      };
    });

    await expect(
      sendPreparedPostCallCsatSms(
        {
          userId: "user-1",
          customerNumber: "+13125550123",
          body: "How was your call? Reply 1-5.",
        },
        {
          idempotencyKey: "post-call-csat/job-1",
          reservationAttempt: 1,
          beforeProviderAttempt: async () => undefined,
        },
      ),
    ).resolves.toEqual({
      sent: false,
      reason: "Delivery status is unknown. Do not resend.",
      code: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
      providerOutcomeAmbiguous: true,
      doNotResend: true,
    });
  });
});
