import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Mock localStorage for the browser context
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();
Object.defineProperty(global, "localStorage", { value: localStorageMock });

// Import the module under test
const { authFetch, safeJson } = await import("./api");

describe("authFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorageMock.clear();
    // Store session object as authFetch now reads from wireline_session
    localStorageMock.setItem(
      "wireline_session",
      JSON.stringify({ access_token: "test-token", user: { id: "test-user" } }),
    );
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("attaches Authorization header when a local token is available", async () => {
    await authFetch("/api/test");
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers?.Authorization).toBe("Bearer test-token");
  });

  it("passes through the URL unmodified", async () => {
    await authFetch("/api/some/endpoint");
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe("/api/some/endpoint");
  });

  it("merges caller-provided headers with the auth header", async () => {
    await authFetch("/api/test", {
      headers: { "Content-Type": "application/json" },
    });
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers?.Authorization).toBe("Bearer test-token");
    expect(callArgs[1].headers?.["Content-Type"]).toBe("application/json");
  });

  it("aborts the request when the internal timeout fires, even with a caller signal", async () => {
    vi.useFakeTimers();
    let observed: AbortSignal | undefined;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      observed = (init as RequestInit).signal as AbortSignal;
      return new Promise<Response>(() => {
        /* hang forever */
      });
    });

    const ctrl = new AbortController();
    void authFetch("/api/slow", { signal: ctrl.signal });

    await Promise.resolve();
    await Promise.resolve();
    expect(observed).toBeDefined();
    expect(observed!.aborted).toBe(false);
    vi.advanceTimersByTime(120_001);
    expect(observed!.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("honors caller cancellation while still enforcing its timeout deadline", async () => {
    let observed: AbortSignal | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      observed = (init as RequestInit).signal as AbortSignal;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const ctrl = new AbortController();
    await authFetch("/api/test", { signal: ctrl.signal });
    expect(observed).toBeDefined();
    expect(observed!.aborted).toBe(false);
    ctrl.abort(new Error("user cancelled"));
    expect(observed!.aborted).toBe(true);
  });

  it("omits the auth header when no local token is available", async () => {
    localStorageMock.removeItem("wireline_session");
    await authFetch("/api/test");
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers?.Authorization).toBeUndefined();
  });
});

describe("safeJson", () => {
  it("parses a valid JSON response", async () => {
    const res = new Response(JSON.stringify({ ok: true, value: 42 }), {
      headers: { "Content-Type": "application/json" },
    });
    const parsed = await safeJson<{ ok: boolean; value: number }>(res);
    expect(parsed).toEqual({ ok: true, value: 42 });
  });

  it("returns a generic error object on invalid JSON without throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = new Response("<html>500 internal server error</html>", {
      headers: { "Content-Type": "text/html" },
    });
    const parsed = await safeJson(res);
    expect(parsed).toEqual({ error: expect.stringContaining("unexpected error") });
    consoleSpy.mockRestore();
  });

  it("handles empty response body", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = new Response("");
    const parsed = await safeJson(res);
    expect(parsed).toEqual({ error: expect.any(String) });
    consoleSpy.mockRestore();
  });

  it("parses arrays correctly", async () => {
    const res = new Response(JSON.stringify([1, 2, 3]));
    const parsed = await safeJson<number[]>(res);
    expect(parsed).toEqual([1, 2, 3]);
  });

  it("parses null correctly", async () => {
    const res = new Response("null");
    const parsed = await safeJson(res);
    expect(parsed).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────
//  AUDIT API ENDPOINTS — unit tests (fetch is mocked)
// ──────────────────────────────────────────────────────────
describe("Audit API Endpoints", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/audit/export")) {
        return Promise.resolve(
          new Response("date,event_type\n2026-01-01,agent.created", {
            status: 200,
            headers: { "Content-Type": "text/csv" },
          }),
        );
      }
      if (url.includes("/api/audit/stats")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              total_events: 42,
              by_severity: { low: 10, medium: 20, high: 12 },
              total_cost_usd: 1.23,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      // /api/audit/events
      return Promise.resolve(
        new Response(JSON.stringify({ events: [{ id: 1, event_type: "agent.created" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("should fetch audit events with filters", async () => {
    const response = await fetch("/api/audit/events?event_type=agent.created&days=7", {
      headers: { Authorization: "Bearer test-token" },
    });
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.events).toBeDefined();
    expect(Array.isArray(data.events)).toBe(true);
  });

  it("should fetch audit statistics", async () => {
    const response = await fetch("/api/audit/stats?days=30", {
      headers: { Authorization: "Bearer test-token" },
    });
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.total_events).toBeDefined();
    expect(data.by_severity).toBeDefined();
    expect(data.total_cost_usd).toBeDefined();
  });

  it("should export audit events as CSV", async () => {
    const response = await fetch("/api/audit/export?format=csv&days=7", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("text/csv");
  });
});
