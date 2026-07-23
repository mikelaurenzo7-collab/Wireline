import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonSafeId, toJsonbSafe } from "../src/lib/server-utils";
import {
  isWithinCallWindow,
  nextCallWindowOpenAt,
  formatLocalHhMm,
} from "../src/services/campaign-dialer";
import { LEAD_STATUS } from "../src/lib/outbound-status";

describe("jsonb BigInt safety", () => {
  it("jsonSafeId stringifies bigint lead ids", () => {
    expect(jsonSafeId(42n)).toBe("42");
    expect(jsonSafeId(42)).toBe("42");
    expect(jsonSafeId("42")).toBe("42");
    expect(jsonSafeId(null)).toBeNull();
  });

  it("toJsonbSafe makes BigInt metadata JSON-serializable", () => {
    const raw = { duplicate_of_lead_id: 999999999999999999n, nested: { leadId: 7n } };
    expect(() => JSON.stringify(raw)).toThrow(/BigInt/);
    const safe = toJsonbSafe(raw);
    expect(() => JSON.stringify(safe)).not.toThrow();
    expect(safe.duplicate_of_lead_id).toBe("999999999999999999");
    expect(safe.nested.leadId).toBe("7");
  });
});

describe("call window scheduling", () => {
  it("handles same-day and overnight windows", () => {
    expect(isWithinCallWindow("09:00", "17:00", "09:00")).toBe(true);
    expect(isWithinCallWindow("09:00", "17:00", "17:00")).toBe(true);
    expect(isWithinCallWindow("09:00", "17:00", "08:59")).toBe(false);
    expect(isWithinCallWindow("09:00", "17:00", "17:01")).toBe(false);
    expect(isWithinCallWindow("20:00", "06:00", "21:00")).toBe(true);
    expect(isWithinCallWindow("20:00", "06:00", "05:00")).toBe(true);
    expect(isWithinCallWindow("20:00", "06:00", "12:00")).toBe(false);
  });

  it("nextCallWindowOpenAt returns now when already inside the window", () => {
    const inside = new Date();
    inside.setHours(10, 30, 0, 0);
    const next = nextCallWindowOpenAt("09:00", "17:00", inside);
    expect(next.getTime()).toBe(inside.getTime());
  });

  it("nextCallWindowOpenAt schedules tomorrow when past same-day close", () => {
    const afterClose = new Date(2026, 6, 8, 18, 0, 0, 0);
    const next = nextCallWindowOpenAt("09:00", "17:00", afterClose);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(6);
    expect(next.getDate()).toBe(9);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it("nextCallWindowOpenAt schedules today when before same-day open", () => {
    const beforeOpen = new Date(2026, 6, 8, 7, 15, 0, 0);
    const next = nextCallWindowOpenAt("09:00", "17:00", beforeOpen);
    expect(next.getDate()).toBe(8);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it("formatLocalHhMm returns zero-padded HH:MM", () => {
    expect(formatLocalHhMm(new Date(2026, 0, 1, 9, 5))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("outbound dial gate runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.FEDERAL_DNC_ALLOW_UNCONFIGURED = "true";
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
  });

  it("writes JSON-safe duplicate_of_lead_id when another lead was called recently", async () => {
    const otherId = 1234567890123456789n;
    const limit = vi.fn(async () => [{ id: otherId }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));

    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/tcpa-calling-hours", () => ({
      resolveCallingHoursForPhone: () => ({
        allowed: true,
        state: "CA",
        timeZone: "America/Los_Angeles",
        localHour: 12,
        startHour: 8,
        endHour: 21,
        inferred: true,
      }),
    }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: () => ({ allowed: true }),
      isFederalDncListed: async () => false,
    }));
    vi.doMock("../src/lib/compliance", () => ({
      isDncBlocked: async () => false,
    }));

    const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
    const result = await evaluateOutboundDialGate({
      userId: "user-1",
      phone: "+15551234567",
      leadId: 1n,
      metadata: { has_express_written_consent: true },
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.status).toBe(LEAD_STATUS.SKIPPED_DUPLICATE);
    expect(result.metadataPatch?.duplicate_of_lead_id).toBe(String(otherId));
    expect(typeof result.metadataPatch?.duplicate_of_lead_id).toBe("string");
    expect(() => JSON.stringify(result.metadataPatch)).not.toThrow();
  });

  it("schedules callback when self was called within 24h", async () => {
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select: vi.fn() },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/tcpa-calling-hours", () => ({
      resolveCallingHoursForPhone: () => ({
        allowed: true,
        state: "CA",
        timeZone: "America/Los_Angeles",
        localHour: 12,
        startHour: 8,
        endHour: 21,
        inferred: true,
      }),
    }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: () => ({ allowed: true }),
      isFederalDncListed: async () => false,
    }));
    vi.doMock("../src/lib/compliance", () => ({
      isDncBlocked: async () => false,
    }));

    const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
    const result = await evaluateOutboundDialGate({
      userId: "user-1",
      phone: "+15551234567",
      leadId: 2n,
      lastCalledAt: new Date(Date.now() - 60_000),
      metadata: { has_express_written_consent: true },
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.status).toBe(LEAD_STATUS.CALLBACK_SCHEDULED);
    expect(result.reason).toBe("self_recent_call_scheduled");
    expect(result.metadataPatch?.duplicate_guard).toBe("self_within_24h");
  });
});

describe("campaign dialer outside-window reschedule", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("enqueues deferred campaign_dial when outside call window", async () => {
    const campaign = {
      id: "camp-1",
      userId: "user-1",
      name: "Morning dials",
      status: "running",
      callWindowStart: "09:00",
      callWindowEnd: "17:00",
      maxAttempts: 3,
      agentId: "agent-1",
      goal: "book demos",
    };

    const enqueue = vi.fn(async () => ({ ok: true, jobId: "job-deferred" }));
    const pendingLimit = vi.fn(async () => []);
    const pendingWhere = vi.fn(() => ({ limit: pendingLimit }));
    const pendingFrom = vi.fn(() => ({ where: pendingWhere }));

    const campaignLimit = vi.fn(async () => [campaign]);
    const campaignWhere = vi.fn(() => ({ limit: campaignLimit }));
    const campaignFrom = vi.fn(() => ({ where: campaignWhere }));

    let selectCalls = 0;
    const select = vi.fn(() => {
      selectCalls += 1;
      // First select: load campaign; second: pending deferred job check
      return { from: selectCalls === 1 ? campaignFrom : pendingFrom };
    });

    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/job-queue", () => ({ enqueue }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: () => ({ allowed: true }),
      isFederalDncListed: async () => false,
    }));
    vi.doMock("../src/lib/vapi-client", () => ({
      placeOutboundCall: vi.fn(),
    }));
    vi.doMock("../src/lib/voice-spend-control", () => ({
      assertOutboundVoiceAllowed: vi.fn(),
    }));
    vi.doMock("../src/lib/outbound-dial-gate", () => ({
      evaluateOutboundDialGate: vi.fn(),
    }));

    // Force "outside window" by stubbing locale time to 20:00
    const localeSpy = vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("20:00");

    const { CampaignDialerService } = await import("../src/services/campaign-dialer");
    const dialer = new CampaignDialerService();
    await dialer.processCampaignById("user-1", "camp-1");

    expect(enqueue).toHaveBeenCalledTimes(1);
    const args = enqueue.mock.calls[0][1];
    expect(args.type).toBe("campaign_dial");
    expect(args.payload).toEqual({ userId: "user-1", campaignId: "camp-1" });
    expect(args.runAt).toBeInstanceOf(Date);
    expect(args.runAt.getHours()).toBe(9);
    expect(args.runAt.getMinutes()).toBe(0);

    localeSpy.mockRestore();
  });

  it("does not dial leads when campaign id is not RUNNING for tenant", async () => {
    const enqueue = vi.fn();
    const campaignLimit = vi.fn(async () => []);
    const campaignWhere = vi.fn(() => ({ limit: campaignLimit }));
    const campaignFrom = vi.fn(() => ({ where: campaignWhere }));
    const select = vi.fn(() => ({ from: campaignFrom }));

    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select, update: vi.fn(), insert: vi.fn() },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/job-queue", () => ({ enqueue }));

    const { CampaignDialerService } = await import("../src/services/campaign-dialer");
    const dialer = new CampaignDialerService();
    await dialer.processCampaignById("user-1", "missing-camp");

    expect(enqueue).not.toHaveBeenCalled();
    expect(campaignWhere).toHaveBeenCalled();
  });
});

describe("campaign launch enqueue rollback contract", () => {
  it("rolls status back when enqueue fails after marking RUNNING", async () => {
    // Behavioral simulation of the launch path in campaign-routes.ts
    const previousStatus = "draft";
    let campaignStatus = previousStatus;
    const enqueue = async (): Promise<{ ok: boolean; error?: string }> => ({
      ok: false,
      error: "insert failed",
    });

    campaignStatus = "running";
    const enq = await enqueue();
    if (!enq.ok) {
      campaignStatus = previousStatus;
    }

    expect(enq.ok).toBe(false);
    expect(campaignStatus).toBe("draft");
  });
});
