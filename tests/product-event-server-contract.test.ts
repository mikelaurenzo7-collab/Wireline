import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drizzle, log } from "../src/lib/server-context";
import {
  emitServerProductEvent,
  emitServerProductEventOnce,
  _resetServerProductEventOnceForTests,
} from "../src/lib/product-event-server";

const insertValues = vi.fn().mockResolvedValue(undefined);

describe("product event server emission", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    insertValues.mockReset();
    insertValues.mockResolvedValue(undefined);
    vi.spyOn(log, "info").mockImplementation(() => undefined);
    vi.spyOn(log, "warn").mockImplementation(() => undefined);
    vi.spyOn(drizzle, "insert").mockReturnValue({ values: insertValues } as never);
    _resetServerProductEventOnceForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(log.info).toHaveBeenCalledWith(
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
    expect(drizzle.insert).toHaveBeenCalled();
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
    expect(log.info).toHaveBeenCalledTimes(1);
  });
});
