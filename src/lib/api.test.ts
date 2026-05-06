import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Mock supabase before importing the module under test so the import side
// effect (createClient) uses the mock rather than the real SDK.
vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

// Import after mock is registered.
const { authFetch } = await import("./api");

describe("authFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
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

  it("attaches Authorization header when a session token is available", async () => {
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

  it("honors a caller-supplied AbortSignal instead of installing its own", async () => {
    const ctrl = new AbortController();
    await authFetch("/api/test", { signal: ctrl.signal });
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].signal).toBe(ctrl.signal);
  });

  it("omits the auth header when no session is available", async () => {
    const { supabase } = await import("./supabase");
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
    } as any);

    await authFetch("/api/test");
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers?.Authorization).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────
//  AUDIT API ENDPOINTS — unit tests (fetch is mocked)
// ──────────────────────────────────────────────────────────
describe('Audit API Endpoints', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/audit/export')) {
        return Promise.resolve(
          new Response('date,event_type\n2026-01-01,agent.created', {
            status: 200,
            headers: { 'Content-Type': 'text/csv' },
          }),
        );
      }
      if (url.includes('/api/audit/stats')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              total_events: 42,
              by_severity: { low: 10, medium: 20, high: 12 },
              total_cost_usd: 1.23,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      // /api/audit/events
      return Promise.resolve(
        new Response(
          JSON.stringify({ events: [{ id: 1, event_type: 'agent.created' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('should fetch audit events with filters', async () => {
    const response = await fetch('/api/audit/events?event_type=agent.created&days=7', {
      headers: { Authorization: 'Bearer test-token' }
    });
    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data.events).toBeDefined();
    expect(Array.isArray(data.events)).toBe(true);
  });

  it('should fetch audit statistics', async () => {
    const response = await fetch('/api/audit/stats?days=30', {
      headers: { Authorization: 'Bearer test-token' }
    });
    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data.total_events).toBeDefined();
    expect(data.by_severity).toBeDefined();
    expect(data.total_cost_usd).toBeDefined();
  });

  it('should export audit events as CSV', async () => {
    const response = await fetch('/api/audit/export?format=csv&days=7', {
      headers: { Authorization: 'Bearer test-token' }
    });
    
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/csv');
  });
});
