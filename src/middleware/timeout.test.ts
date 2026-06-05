import { describe, expect, it, vi } from "vitest";
import { defaultApiTimeoutMiddleware, timeoutMiddleware } from "./timeout";

describe("defaultApiTimeoutMiddleware", () => {
  it("skips dedicated routes so stacked timers do not cap Director at 20s", () => {
    const next = vi.fn();
    defaultApiTimeoutMiddleware(
      { originalUrl: "/api/director/messages" },
      { on: vi.fn(), locals: {} },
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it("wraps ordinary API routes with the default timeout handler", () => {
    const on = vi.fn();
    const res = {
      headersSent: false,
      on,
      locals: {},
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      socket: null,
    };
    const next = vi.fn();
    defaultApiTimeoutMiddleware({ originalUrl: "/api/agents" }, res, next);
    expect(next).toHaveBeenCalled();
    expect(on).toHaveBeenCalled();
  });
});

describe("timeoutMiddleware", () => {
  it("returns middleware function", () => {
    expect(typeof timeoutMiddleware(1000)).toBe("function");
  });
});
