import { beforeEach, describe, expect, it, vi } from "vitest";

describe("outbound purpose audit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("writes one row for an allow and a block and stores no secrets", async () => {
    const values = vi.fn(async () => undefined);
    const insert = vi.fn(() => ({ values }));
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { insert },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    const { recordOutboundPurposeAudit } = await import("../src/lib/outbound-purpose-audit");
    await recordOutboundPurposeAudit({
      userId: "tenant-1",
      channel: "call",
      destinationE164: "+14155550100",
      requestedPurpose: "sales",
      effectivePurpose: "returning_contact",
      derivedRelationship: {
        kind: "returning_contact",
        source: "sms",
        sourceId: "msg-1",
        at: "2026-10-01T00:00:00.000Z",
      },
      attested: true,
      confirmations: { permission: true, nonsales: true },
      dncChecked: false,
      dncSource: "none",
      dncResult: "skipped",
      quietHoursTz: "America/Los_Angeles",
      decision: "allowed",
      actorIp: "203.0.113.8",
      userAgent: "BotBound",
    });
    await recordOutboundPurposeAudit({
      userId: "tenant-1",
      channel: "sms",
      destinationE164: "+14155550100",
      requestedPurpose: "sales",
      effectivePurpose: "sales",
      dncChecked: true,
      dncSource: "vendor",
      dncResult: "listed",
      dncListVersion: "2026-10-26T00:00:00.000Z",
      decision: "blocked",
      blockCode: "blocked_tcpa",
    });
    expect(insert).toHaveBeenCalledTimes(2);
    const allowed = values.mock.calls[0][0];
    const blocked = values.mock.calls[1][0];
    expect(allowed).toMatchObject({
      requestedPurpose: "sales",
      effectivePurpose: "returning_contact",
      decision: "allowed",
      dncResult: "skipped",
      quietHoursTz: "America/Los_Angeles",
    });
    expect(blocked).toMatchObject({ decision: "blocked", blockCode: "blocked_tcpa", dncResult: "listed" });
    expect(JSON.stringify(values.mock.calls)).not.toMatch(/api[_-]?key|secret|bearer|FEDERAL_DNC_API/i);
  });

  it("does not throw when the table is not inserted yet", async () => {
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select: vi.fn() },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    const { recordOutboundPurposeAudit } = await import("../src/lib/outbound-purpose-audit");
    await expect(
      recordOutboundPurposeAudit({
        userId: "tenant-1",
        channel: "call",
        destinationE164: "+14155550100",
        requestedPurpose: "personal",
        effectivePurpose: "personal",
        dncChecked: false,
        dncSource: "none",
        decision: "blocked",
        blockCode: "outside_permitted_calling_hours",
      }),
    ).resolves.toBeUndefined();
  });
});
