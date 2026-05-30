/**
 * utils — covers cn() class merging plus the abort/network-blip
 * filtering used to keep Sentry + console quiet during SPA navigation
 * and E2E runs. Locks in the exact error-name + message heuristics so
 * a future refactor can't silently start logging benign aborts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cn, isAbortError, logFetchError } from "./utils.js";

describe("cn", () => {
  it("dedupes Tailwind conflicts via twMerge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("joins truthy values and drops falsy ones", () => {
    const include: string | false = "c";
    expect(cn("a", (false as boolean) && "b", null, undefined, include)).toBe("a c");
  });

  it("flattens conditional objects and arrays (clsx behavior)", () => {
    expect(cn(["a", { b: true, c: false }], "d")).toBe("a b d");
  });
});

describe("isAbortError", () => {
  it("returns false for nullish input", () => {
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });

  it("detects DOMException-style AbortError by name", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it.each([
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
    "NS_BINDING_ABORTED",
    "The user aborted a request.",
    "request was aborted",
  ])("detects message variants: %s", (msg) => {
    expect(isAbortError(new Error(msg))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isAbortError(new Error("ECONNREFUSED"))).toBe(false);
    expect(isAbortError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  it("handles non-Error throwables that stringify cleanly", () => {
    expect(isAbortError("Failed to fetch")).toBe(true);
    expect(isAbortError("totally unrelated boom")).toBe(false);
  });
});

describe("logFetchError", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => consoleSpy.mockClear());

  it("suppresses abort/network-blip noise", () => {
    logFetchError("Failed to load:", new Error("Failed to fetch"));
    logFetchError("Failed to load:", { name: "AbortError" });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("forwards real errors to console.error", () => {
    const err = new Error("boom");
    logFetchError("Label:", err);
    expect(consoleSpy).toHaveBeenCalledWith("Label:", err);
  });
});
