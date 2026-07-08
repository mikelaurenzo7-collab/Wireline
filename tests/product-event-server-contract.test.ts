import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  emitServerProductEvent,
  emitServerProductEventOnce,
  _resetServerProductEventOnceForTests,
} from "../src/lib/product-event-server";

const logInfo = vi.fn();

vi.mock("../src/lib/server-context", () => ({
  log: { info: (...args: unknown[]) => logInfo(...args) },
}));

describe("product event server emission", () => {
  beforeEach(() => {
    logInfo.mockClear();
    _resetServerProductEventOnceForTests();
  });

  it("logs structured product events for server workflows", () => {
    emitServerProductEvent({
      event: "tenant_activated",
      userId: "user-123",
      metadata: { call_log_id: "42" },
    });

    expect(logInfo).toHaveBeenCalledWith(
      "product_event",
      expect.objectContaining({
        product_event: "tenant_activated",
        userId: "user-123",
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
