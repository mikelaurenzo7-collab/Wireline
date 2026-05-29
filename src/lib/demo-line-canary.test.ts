import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock server-context before importing the module under test
vi.mock("./server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./email-service", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, provider: "resend", id: "test-id" }),
}));

// Mock contact agents to a minimal set for testing
vi.mock("../data/contact-agents", () => ({
  WIRELINE_CONTACT_AGENTS: [{ name: "Sarah", tel: "+16306425661", defaultVibe: "warm" }],
  WIRELINE_DEMO_AGENTS: [{ name: "Marcus", tel: "+16173134469", defaultVibe: "authoritative" }],
}));

import { runDemoLineCanary } from "./demo-line-canary";
import { sendEmail } from "./email-service";

const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;

describe("demo-line-canary", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.VAPI_PRIVATE_KEY = "test-vapi-key";
    process.env.OWNER_EMAIL = "mike@test.com";
    mockSendEmail.mockResolvedValue({ ok: true, provider: "resend", id: "test" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("reports all healthy when Vapi numbers have valid assistants", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // GET /phone-number — both numbers present with assistantIds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "num-1", number: "+16306425661", assistantId: "ast-sarah", createdAt: "2026-01-01" },
        { id: "num-2", number: "+16173134469", assistantId: "ast-marcus", createdAt: "2026-01-01" },
      ],
    });

    // GET /assistant/ast-sarah
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ast-sarah", name: "Sarah" }),
    });
    // GET /call?phoneNumberId=num-1 — recent call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ createdAt: new Date(Date.now() - 2 * 86400000).toISOString() }],
    });

    // GET /assistant/ast-marcus
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ast-marcus", name: "Marcus" }),
    });
    // GET /call?phoneNumberId=num-2 — recent call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ createdAt: new Date(Date.now() - 1 * 86400000).toISOString() }],
    });

    const result = await runDemoLineCanary();

    expect(result.allHealthy).toBe(true);
    expect(result.alertSent).toBe(false);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].numberOk).toBe(true);
    expect(result.lines[0].assistantOk).toBe(true);
    expect(result.lines[1].numberOk).toBe(true);
    expect(result.lines[1].assistantOk).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("detects missing number and sends alert", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // GET /phone-number — Sarah's number is MISSING
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "num-2", number: "+16173134469", assistantId: "ast-marcus", createdAt: "2026-01-01" },
      ],
    });

    // GET /assistant/ast-marcus (for Marcus, which is present)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ast-marcus", name: "Marcus" }),
    });
    // GET /call for Marcus
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await runDemoLineCanary();

    expect(result.allHealthy).toBe(false);
    expect(result.alertSent).toBe(true);
    expect(result.lines[0].name).toBe("Sarah");
    expect(result.lines[0].numberOk).toBe(false);
    expect(result.lines[0].error).toContain("not found");
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail.mock.calls[0][0].to).toBe("mike@test.com");
    expect(mockSendEmail.mock.calls[0][0].subject).toContain("Demo Line Alert");
  });

  it("detects unreachable assistant and sends alert", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // GET /phone-number — both present
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "num-1", number: "+16306425661", assistantId: "ast-sarah", createdAt: "2026-01-01" },
        { id: "num-2", number: "+16173134469", assistantId: "ast-marcus", createdAt: "2026-01-01" },
      ],
    });

    // GET /assistant/ast-sarah — 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    // GET /assistant/ast-marcus — OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ast-marcus" }),
    });
    // GET /call for Marcus
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await runDemoLineCanary();

    expect(result.allHealthy).toBe(false);
    expect(result.lines[0].name).toBe("Sarah");
    expect(result.lines[0].numberOk).toBe(true);
    expect(result.lines[0].assistantOk).toBe(false);
    expect(result.lines[0].error).toContain("unreachable");
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("handles VAPI_PRIVATE_KEY not set gracefully", async () => {
    delete process.env.VAPI_PRIVATE_KEY;
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // vapiFetch should return ok:false without calling fetch
    const result = await runDemoLineCanary();

    expect(result.allHealthy).toBe(false);
    expect(result.error).toContain("VAPI_PRIVATE_KEY");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips alert when OWNER_EMAIL is not set", async () => {
    delete process.env.OWNER_EMAIL;
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // GET /phone-number — empty (all lines missing)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await runDemoLineCanary();

    expect(result.allHealthy).toBe(false);
    expect(result.alertSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("calculates daysSinceLastCall correctly", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

    // Mock by URL matching
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/phone-number")) {
        return {
          ok: true,
          json: async () => [
            { id: "num-1", number: "+16306425661", assistantId: "ast-sarah" },
            { id: "num-2", number: "+16173134469", assistantId: "ast-marcus" },
          ],
        };
      }
      if (url.includes("/assistant/ast-sarah")) {
        return { ok: true, json: async () => ({ id: "ast-sarah" }) };
      }
      if (url.includes("/assistant/ast-marcus")) {
        return { ok: true, json: async () => ({ id: "ast-marcus" }) };
      }
      if (url.includes("/call") && url.includes("num-1")) {
        return { ok: true, json: async () => [{ createdAt: threeDaysAgo }] };
      }
      if (url.includes("/call") && url.includes("num-2")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: true, json: async () => ({}) };
    });

    const result = await runDemoLineCanary();

    expect(result.allHealthy).toBe(true);
    expect(result.lines[0].daysSinceLastCall).toBe(3);
    expect(result.lines[1].daysSinceLastCall).toBeNull();
  });
});
