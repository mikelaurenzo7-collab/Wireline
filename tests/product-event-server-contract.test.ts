import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  emitServerProductEvent,
  emitServerProductEventOnce,
  _resetServerProductEventOnceForTests,
} from "../src/lib/product-event-server";

const logInfo = vi.fn();
const logWarn = vi.fn();
const insertValues = vi.fn().mockResolvedValue(undefined);
const insert = vi.fn(() => ({ values: insertValues }));

vi.mock("../src/lib/server-context", () => ({
  log: {
    info: (...args: unknown[]) => logInfo(...args),
    warn: (...args: unknown[]) => logWarn(...args),
  },
  drizzle: {
    insert: (...args: unknown[]) => insert(...args),
  },
}));

describe("product event server emission", () => {
  beforeEach(() => {
    logInfo.mockClear();
    logWarn.mockClear();
    insert.mockClear();
    insertValues.mockClear();
    _resetServerProductEventOnceForTests();
  });

  it("logs structured product events for server workflows", () => {
    emitServerProductEvent({
      event: "tenant_activated",
      userId: "user-123",
      surface: "web_workspace",
      correlationId: "web:tenant_activated:test",
      demoAccount: true,
      metadata: { call_log_id: "42" },
    });

    expect(logInfo).toHaveBeenCalledWith(
      "product_event",
      expect.objectContaining({
        product_event: "tenant_activated",
        userId: "user-123",
        surface: "web_workspace",
        correlationId: "web:tenant_activated:test",
        demoAccount: true,
        metadata: expect.objectContaining({ call_log_id: "42" }),
        payload: expect.objectContaining({ event: "tenant_activated" }),
      }),
    );
    expect(insert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          surface: "web_workspace",
          correlation_id: "web:tenant_activated:test",
          demo_account: true,
        }),
      }),
    );
  });

  it("dedupes once-per-user activation milestones", () => {
    const input = {
      event: "first_next_action_approved" as const,
      userId: "user-456",
      metadata: { task_id: "task-1" },
    };
    expect(emitServerProductEventOnce(input)).toBe(true);
    expect(emitServerProductEventOnce(input)).toBe(false);
    expect(logInfo).toHaveBeenCalledTimes(1);
  });
});
