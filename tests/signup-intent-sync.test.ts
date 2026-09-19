import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_INTENT_SYNC_TIMEOUT_MS, syncSignupIntent } from "../src/lib/signup-intent";

const intent = { preferredPlanId: "starter" as const, capturedAt: "2026-09-19T00:00:00Z" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("best-effort signup attribution", () => {
  it("aborts a stalled request at the attribution deadline", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options: RequestInit) => {
        signal = options.signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
    );
    const pending = syncSignupIntent(intent);
    const settled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(SIGNUP_INTENT_SYNC_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline after successful sync and includes credentials", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    await syncSignupIntent(intent);
    expect(request).toHaveBeenCalledWith(
      "/api/auth/signup-intent",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify(intent),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a request without signup intent", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await syncSignupIntent(null);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
