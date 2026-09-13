import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureException } from "../src/lib/sentry";
import { errorReportRoute } from "../src/lib/error-report-route";

describe("error report route boundary", () => {
  it.each([
    "https://botbound.me/reset-password?token=fake_secret#fake_fragment",
    "/reset-password?token=fake_secret#fake_fragment",
    "https://fake_user:fake_password@botbound.me/reset-password?code=fake_code",
  ])("keeps only the route for current and legacy clients: %s", (url) => {
    expect(errorReportRoute(url)).toBe("/reset-password");
  });

  it.each([
    undefined,
    null,
    {},
    "not a URL",
    "//other.test/path",
    "/\\other.test/path",
    "javascript:alert(1)",
    "https://[",
  ])("omits malformed or unsupported route input: %s", (url) =>
    expect(errorReportRoute(url)).toBeUndefined(),
  );

  it("bounds routes and redacts identifiable path segments", () => {
    expect(errorReportRoute(`https://botbound.me/${"x".repeat(600)}`)).toHaveLength(500);
    expect(errorReportRoute(`https://botbound.me/${"x".repeat(9_000)}`)).toBeUndefined();
    expect(errorReportRoute("/agents/123e4567-e89b-42d3-a456-426614174000")).toBe(
      "/agents/[redacted-id]",
    );
  });
});

describe("browser error reporting privacy", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { location: { href: "https://botbound.me/" } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends route diagnostics without page queries, fragments, or arbitrary context values", () => {
    vi.stubGlobal("window", {
      location: {
        href: "https://botbound.me/reset-password?token=fake_reset_secret#fake_fragment",
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    captureException(new Error("Page failed"), {
      errorClass: "PageError",
      componentStack: "at ResetPassword (ResetPassword.tsx:42:7)",
      customer: { privateNote: "fake_private_customer_note" },
    });
    const [url, init] = fetchMock.mock.calls[0];
    const report = JSON.parse(init.body);
    expect(url).toBe("/api/health/report");
    expect(report.url).toBe("/reset-password");
    expect(report.context).toEqual({
      errorClass: "PageError",
      componentStack: "at ResetPassword (ResetPassword.tsx:42:7)",
    });
    for (const secret of ["fake_reset_secret", "fake_fragment", "fake_private_customer_note"]) {
      expect(init.body).not.toContain(secret);
    }
  });

  it("redacts signed URLs and email identifiers in error messages and stacks", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const error = new Error("Failed for qa@example.com at /oauth-complete?code=fake_oauth_code");
    error.stack = "at https://botbound.me/reset-password?token=fake_stack_secret";
    captureException(error);
    const body = fetchMock.mock.calls[0][1].body;
    for (const secret of ["qa@example.com", "fake_oauth_code", "fake_stack_secret"]) {
      expect(body).not.toContain(secret);
    }
    expect(body).toContain("[REDACTED]");
  });

  it("does not amplify an application error when context is circular", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const context: Record<string, unknown> = { errorClass: "PageError" };
    context.self = context;
    expect(() => captureException(new Error("Page failed"), context)).not.toThrow();
  });

  it("uses the same private payload for sendBeacon", async () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("window", {
      location: { href: "https://botbound.me/inbox?q=fake_private_search" },
    });
    captureException(new Error("Inbox failed"));
    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/health/report");
    expect(JSON.parse(await blob.text())).toMatchObject({ url: "/inbox", message: "Inbox failed" });
    expect(await blob.text()).not.toContain("fake_private_search");
  });

  it("keeps transport failures from breaking the application", () => {
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("Beacon unavailable");
      },
    });
    expect(() => captureException(new Error("Original failure"))).not.toThrow();
    expect(console.error).toHaveBeenCalledWith("[wireline]", "Original failure");
  });
});
