import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
import { reconcileUsageReceipts } from "../src/lib/usage-billing-store";

describe("durable usage receipt reconciliation", () => {
  it("replays stored computer and email usage after a failed write, preserving the original period and quantity", async () => {
    const computer = {
      userId: "user-1",
      sourceId: "task-1",
      receipt: {
        periodKey: "pe:2026-11-01",
        quantity: 2.5,
        occurredAt: "2026-10-24T12:00:00.000Z",
      },
    };
    const email = {
      userId: "user-1",
      sourceId: "thread-1:reply-1",
      receipt: { periodKey: "pe:2026-11-01", quantity: 1, occurredAt: "2026-10-24T12:05:00.000Z" },
    };
    const reader = {
      select: () => ({
        from: (table: Parameters<typeof getTableName>[0]) => {
          const rows = getTableName(table) === "wireline_computer_tasks" ? [computer] : [email];
          const chain = { where: () => chain, orderBy: () => chain, limit: async () => rows };
          return chain;
        },
      }),
    } as unknown as Parameters<typeof reconcileUsageReceipts>[1];
    const record = vi
      .fn()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValue(undefined);
    await expect(reconcileUsageReceipts(200, reader, record)).rejects.toThrow(
      "storage unavailable",
    );
    await reconcileUsageReceipts(200, reader, record);
    expect(record.mock.calls.map(([input]) => input)).toEqual([
      { ...computer, meter: "computer_minutes", sourceType: "computer_task" },
      { ...computer, meter: "computer_minutes", sourceType: "computer_task" },
      { ...email, meter: "emails_handled", sourceType: "email_reply" },
    ]);
  });
});
