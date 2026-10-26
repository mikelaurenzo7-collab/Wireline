import { beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateSmsThreadReplyGate } from "../src/lib/sms-reply-compliance";
import { SALES_DNC_LISTED_MESSAGE } from "../src/lib/outbound-compliance-copy";

describe("sms reply purpose", () => {
  const nowMs = Date.parse("2026-10-26T18:00:00.000Z");

  it("does not ask for federal screening when the contact texted two hours ago", async () => {
    const evaluateGate = vi.fn(async () => ({
      allowed: true as const,
      tcpaDecision: { allowed: true },
    }));
    await evaluateSmsThreadReplyGate(
      { userId: "tenant-1", threadId: "thread-1", phone: "+14155550123", requestedPurpose: "sales" },
      {
        now: () => nowMs,
        loadLatestInboundArtifact: async () => ({ createdAt: new Date(nowMs - 2 * 60 * 60 * 1000) }),
        deriveRelationship: async () => null,
        evaluateGate,
      },
    );
    expect(evaluateGate).toHaveBeenCalledWith(
      expect.objectContaining({
        isMarketingCall: false,
        requireFederalDncScreening: false,
        isLiveSessionFollowUp: false,
      }),
    );
  });

  it("sends a cold sales text through mandatory federal screening", async () => {
    const evaluateGate = vi.fn(async () => ({
      allowed: false as const,
      status: "AutoDialFailed",
      reason: "federal_dnc_unconfigured" as const,
    }));
    const result = await evaluateSmsThreadReplyGate(
      { userId: "tenant-1", threadId: "thread-1", phone: "+14155550123", requestedPurpose: "sales" },
      {
        now: () => nowMs,
        loadLatestInboundArtifact: async () => null,
        deriveRelationship: async () => null,
        evaluateGate,
      },
    );
    expect(evaluateGate).toHaveBeenCalledWith(
      expect.objectContaining({
        isMarketingCall: true,
        requireFederalDncScreening: true,
        salesScreening: "one_off",
      }),
    );
    expect(result.allowed).toBe(false);
  });
});

describe("sales-only federal screening", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("skips the registry lookup for personal, appointment, existing customer, and returning calls", async () => {
    const isFederalDncListed = vi.fn(async () => true);
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/tcpa-calling-hours", () => ({
      resolveCallingHoursForPhone: () => ({ allowed: true, timeZone: "America/Chicago", startHour: 8, endHour: 20 }),
    }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: vi.fn(),
      isFederalDncListed,
    }));
    vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => false }));
    const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
    for (const purpose of ["personal", "appointment_service", "existing_customer", "returning_contact"]) {
      const result = await evaluateOutboundDialGate({
        userId: "tenant-1",
        phone: "+13125550100",
        isMarketingCall: false,
        requireFederalDncScreening: false,
        audit: { requestedPurpose: purpose, effectivePurpose: purpose },
      });
      expect(result.allowed, purpose).toBe(true);
    }
    expect(isFederalDncListed).not.toHaveBeenCalled();
  });

  it("fails a sales call closed when registry access is unset and blocks every purpose on the workspace list", async () => {
    const isDncBlocked = vi.fn(async () => false);
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select: vi.fn() },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: () => ({
        allowed: false as const,
        configured: false as const,
        code: "FEDERAL_DNC_NOT_CONFIGURED" as const,
        message: "Campaigns and automated sales need number screening before they can send. Add a Do Not Call screening connection in Settings. One-at-a-time sales calls and texts still work after you confirm you're responsible for permission and Do Not Call rules. Personal, appointment, and follow-up calls still work.",
      }),
      isFederalDncListed: vi.fn(),
    }));
    vi.doMock("../src/lib/compliance", () => ({ isDncBlocked }));
    const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
    const sales = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
    });
    expect(sales.allowed).toBe(false);
    if (!sales.allowed) expect(sales.reason).toBe("federal_dnc_unconfigured");

    vi.resetModules();
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/tcpa-calling-hours", () => ({
      resolveCallingHoursForPhone: () => ({ allowed: false, timeZone: "America/Chicago", startHour: 8, endHour: 20 }),
    }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: () => ({ allowed: true, configured: true }),
      isFederalDncListed: async () => false,
    }));
    vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => false }));
    const hours = await import("../src/lib/outbound-dial-gate");
    for (const marketing of [true, false]) {
      const quiet = await hours.evaluateOutboundDialGate({
        userId: "tenant-1",
        phone: "+13125550100",
        isMarketingCall: marketing,
        requireFederalDncScreening: marketing,
      });
      expect(quiet.allowed).toBe(false);
      if (!quiet.allowed) expect(quiet.reason).toBe("outside_permitted_calling_hours");
    }

    vi.resetModules();
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/tcpa-calling-hours", () => ({
      resolveCallingHoursForPhone: () => ({ allowed: true, timeZone: "America/Chicago" }),
    }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: () => ({ allowed: true, configured: true }),
      isFederalDncListed: async () => false,
    }));
    vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => true }));
    const blocked = await import("../src/lib/outbound-dial-gate");
    const internal = await blocked.evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: false,
      requireFederalDncScreening: false,
    });
    expect(internal.allowed).toBe(false);
    if (!internal.allowed) {
      expect(internal.reason).toBe("blocked_internal_dnc");
      expect(internal.customerMessage).toMatch(/asked not to be contacted/);
    }
  });

  it("passes the workspace SAN to the registry lookup for a sales call", async () => {
    const isFederalDncListed = vi.fn(async () => true);
    let selects = 0;
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => {
                selects += 1;
                return selects === 1 ? [] : [{ dncSan: "san-123456", dncSellerRegistration: null }];
              },
            }),
          }),
        }),
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/tcpa-calling-hours", () => ({
      resolveCallingHoursForPhone: () => ({ allowed: true, timeZone: "America/New_York" }),
    }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: () => ({ allowed: true, configured: true }),
      isFederalDncListed,
    }));
    vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => false }));
    const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
    const listed = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+12125550100",
      isMarketingCall: true,
      leadId: undefined,
    });
    expect(isFederalDncListed).toHaveBeenCalledWith("+12125550100", { vendorProjectId: "SAN-123456" });
    expect(listed.allowed).toBe(false);
    if (!listed.allowed) expect(listed.customerMessage).toBe(SALES_DNC_LISTED_MESSAGE);
  });
});
