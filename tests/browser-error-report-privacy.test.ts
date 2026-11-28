import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureException } from "../src/lib/sentry";
import { errorReportRoute } from "../src/lib/error-report-route";
import {
  componentPlaces,
  componentTrail,
  errorReportContext,
} from "../src/lib/error-report-context";

describe("error report route boundary", () => {
  it.each([
    "https://botbound.app/reset-password?token=fake_secret#fake_fragment",
    "/reset-password?token=fake_secret#fake_fragment",
    "https://fake_user:fake_password@botbound.app/reset-password?code=fake_code",
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
    expect(errorReportRoute(`https://botbound.app/${"x".repeat(600)}`)).toHaveLength(500);
    expect(errorReportRoute(`https://botbound.app/${"x".repeat(9_000)}`)).toBeUndefined();
    expect(errorReportRoute("/agents/123e4567-e89b-42d3-a456-426614174000")).toBe(
      "/agents/[redacted-id]",
    );
  });
});

describe("browser error reporting privacy", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { location: { href: "https://botbound.app/" } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends route diagnostics without page queries, fragments, or arbitrary context values", () => {
    vi.stubGlobal("window", {
      location: {
        href: "https://botbound.app/reset-password?token=fake_reset_secret#fake_fragment",
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
    error.stack = "at https://botbound.app/reset-password?token=fake_stack_secret";
    captureException(error);
    const body = fetchMock.mock.calls[0][1].body;
    for (const secret of ["qa@example.com", "fake_oauth_code", "fake_stack_secret"]) {
      expect(body).not.toContain(secret);
    }
    expect(body).toContain("[REDACTED]");
  });
  it("preserves safe widget and browser-source grouping labels in transport", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    captureException(new Error("Widget failed"), { widget: "RecentCalls", source: "window-error" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).context).toEqual({
      widget: "RecentCalls",
      source: "window-error",
    });
  });
  it("applies the same bounded label privacy to legacy server context", () => {
    const safe = errorReportContext({
      widget: "x".repeat(500),
      source: "/oauth?code=fake_secret",
      customer: "private customer",
    });
    expect(safe?.widget).toHaveLength(80);
    expect(JSON.stringify(safe)).not.toContain("fake_secret");
    expect(safe).not.toHaveProperty("customer");
  });

  // On 2026-11-27 a new account's Studio crashed inside a shared dialog
  // primitive. The report kept three frames, Presence and Provider among
  // them, which named no screen and so could not be traced.
  it("keeps the whole chain of components a screen crashed under, as names only", () => {
    const stack = [
      "",
      "    at Presence (https://botbound.app/assets/Textarea-Du9rX6ik.js:6:16652)",
      "    at Provider (https://botbound.app/assets/Textarea-Du9rX6ik.js:6:3424)",
      "    at https://botbound.app/assets/Textarea-Du9rX6ik.js:6:9001",
      "    at MobileNavMoreSheet (https://botbound.app/assets/AppShell-BBG32q51.js:2:100)",
      "    at div",
      "    at WorkspaceShell (https://botbound.app/assets/AppShell-BBG32q51.js:2:900)",
    ].join("\n");
    expect(componentTrail(stack)).toBe(
      "Presence < Provider < MobileNavMoreSheet < div < WorkspaceShell",
    );
    expect(componentTrail(stack)).not.toContain("botbound.app");
    expect(componentTrail("")).toBeUndefined();
    expect(componentTrail({ not: "text" })).toBeUndefined();
    const deep = Array.from({ length: 200 }, (_, index) => `    at Layer${index} (x.js:1:1)`).join(
      "\n",
    );
    expect(componentTrail(deep)!.split(" < ").length).toBeLessThanOrEqual(40);
    expect(componentTrail(deep)!.length).toBeLessThanOrEqual(900);
    // The stack that reaches the server is long enough to hold that chain.
    expect(errorReportContext({ componentStack: "x".repeat(9_000) })?.componentStack).toHaveLength(
      4_000,
    );
  });

  // A production build shortens component names to a letter or two. Tracing
  // the 2026-11-27 crash from names alone meant rebuilding the release and
  // guessing; the built file and position place each frame directly.
  it("says where each of those components lives, by built file and position", () => {
    const stack = [
      "",
      "    at Presence (https://botbound.app/assets/Textarea-Du9rX6ik.js:6:16652)",
      "    at Provider (https://botbound.app/assets/Textarea-Du9rX6ik.js:6:3424)",
      "    at https://botbound.app/assets/Textarea-Du9rX6ik.js:6:9001",
      "    at MobileNavMoreSheet (https://botbound.app/assets/AppShell-BBG32q51.js:2:100)",
      "    at div",
      "    at WorkspaceShell (https://botbound.app/assets/AppShell-BBG32q51.js:2:900)",
    ].join("\n");
    const places = componentPlaces(stack)!;
    expect(places).toBe(
      "Textarea-Du9rX6ik:6:16652 < Textarea-Du9rX6ik:6:3424 < AppShell-BBG32q51:2:100 < ? < AppShell-BBG32q51:2:900",
    );
    // One place for each name, in the same order.
    expect(places.split(" < ")).toHaveLength(componentTrail(stack)!.split(" < ").length);
    expect(places).not.toContain("botbound.app");
    expect(places).not.toContain("http");
    // Only the file's name and position: nothing after a question mark.
    expect(
      componentPlaces("    at Qe (https://botbound.app/assets/Studio-a1.js?token=fake_secret:3:7)"),
    ).toBe("Studio-a1:3:7");
    // Nothing to say when no frame names a built file.
    expect(componentPlaces("    at div\n    at span")).toBeUndefined();
    expect(componentPlaces("")).toBeUndefined();
    expect(componentPlaces({ not: "text" })).toBeUndefined();
    const deep = Array.from(
      { length: 200 },
      (_, index) => `    at L${index} (https://botbound.app/assets/Chunk-${index}.js:1:${index})`,
    ).join("\n");
    expect(componentPlaces(deep)!.split(" < ").length).toBeLessThanOrEqual(40);
    expect(componentPlaces(deep)!.length).toBeLessThanOrEqual(1_600);
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
      location: { href: "https://botbound.app/inbox?q=fake_private_search" },
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
