import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: provider.select, update: provider.update, insert: provider.insert },
  log: { info: provider.logInfo, warn: vi.fn(), error: vi.fn() },
}));

import { updateLeadStatusOnCallEnd } from "../src/lib/outbound-call-tracking";
import { LEAD_STATUS } from "../src/lib/outbound-status";

beforeEach(() => {
  vi.clearAllMocks();
  provider.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [] }) }),
  });
});

describe("outbound lead outcome identity", () => {
  it("does not search or mutate a lead by phone when the provider call ID is absent", async () => {
    await updateLeadStatusOnCallEnd("tenant-1", "+12025550123", "qualified", null);

    expect(provider.select).not.toHaveBeenCalled();
    expect(provider.update).not.toHaveBeenCalled();
    expect(provider.insert).not.toHaveBeenCalled();
  });

  it("does not fall back to phone when a provider call ID matches no lead", async () => {
    await updateLeadStatusOnCallEnd("tenant-1", "+12025550123", "qualified", "unknown-call");

    expect(provider.select).toHaveBeenCalledOnce();
    expect(provider.update).not.toHaveBeenCalled();
    expect(provider.insert).not.toHaveBeenCalled();
  });

  it("completes a summary-inferred follow-up and clears a stale callback time", async () => {
    const lead = {
      id: "lead-1",
      customerNumber: "+12025550123",
      campaignId: null,
      attempts: 1,
      callbackScheduledAt: new Date("2026-10-18T15:00:00.000Z"),
    };
    provider.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [lead] }) }),
    });
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    provider.update.mockReturnValue({ set });

    await updateLeadStatusOnCallEnd("tenant-1", lead.customerNumber, "followup", "call-1");

    expect(provider.select).toHaveBeenCalledOnce();
    expect(provider.update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: LEAD_STATUS.COMPLETED,
        callbackScheduledAt: null,
      }),
    );
    expect(where).toHaveBeenCalledOnce();
    expect(provider.insert).not.toHaveBeenCalled();
  });
});
