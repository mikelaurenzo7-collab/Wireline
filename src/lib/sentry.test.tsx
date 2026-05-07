// Frontend Sentry wrapper tests — captureException is called by every
// catch block in the app (including ErrorBoundary). The "no-op when DSN
// unset" path is what runs in dev/preview, so it must never throw.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sentryInit, sentryCaptureException } = vi.hoisted(() => ({
  sentryInit: vi.fn(),
  sentryCaptureException: vi.fn(),
}));

vi.mock("@sentry/react", () => ({
  init: sentryInit,
  captureException: sentryCaptureException,
}));

describe("sentry wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    sentryInit.mockReset();
    sentryCaptureException.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("DSN unset", () => {
    it("does not call Sentry.init when VITE_SENTRY_DSN is absent", async () => {
      const { initSentry } = await import("./sentry");
      await initSentry();
      expect(sentryInit).not.toHaveBeenCalled();
    });

    it("captureException falls back to console.error after init resolves with no DSN", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { initSentry, captureException } = await import("./sentry");
      await initSentry();
      const err = new Error("local dev error");
      captureException(err, { route: "/agents" });
      expect(consoleSpy).toHaveBeenCalledWith("[wireline]", err, { route: "/agents" });
      expect(sentryCaptureException).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("captureException without context still falls back to console.error safely", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { initSentry, captureException } = await import("./sentry");
      await initSentry();
      captureException(new Error("no context"));
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("buffers captureException calls made before init resolves, then drains to console", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { initSentry, captureException } = await import("./sentry");
      // Capture BEFORE init runs — should be buffered, no console call yet.
      captureException(new Error("early-1"), { phase: "render" });
      captureException(new Error("early-2"));
      expect(consoleSpy).not.toHaveBeenCalled();
      // Init flushes the queue to console because no DSN is set.
      await initSentry();
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });

  describe("DSN set", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_SENTRY_DSN", "https://example@sentry.io/12345");
      vi.stubEnv("VITE_SENTRY_TRACES_SAMPLE_RATE", "0.25");
      vi.stubEnv("VITE_VERCEL_GIT_COMMIT_SHA", "abc1234");
    });

    it("initializes Sentry with DSN, env, sample rate, and release tag", async () => {
      const { initSentry } = await import("./sentry");
      await initSentry();
      expect(sentryInit).toHaveBeenCalledTimes(1);
      const config = sentryInit.mock.calls[0][0];
      expect(config.dsn).toBe("https://example@sentry.io/12345");
      expect(config.tracesSampleRate).toBe(0.25);
      expect(config.release).toBe("abc1234");
    });

    it("is idempotent — calling initSentry twice only initializes once", async () => {
      const { initSentry } = await import("./sentry");
      await initSentry();
      await initSentry();
      expect(sentryInit).toHaveBeenCalledTimes(1);
    });

    it("captureException forwards to Sentry.captureException after init", async () => {
      const { initSentry, captureException } = await import("./sentry");
      await initSentry();
      const err = new Error("prod error");
      captureException(err, { user_id: "u-1" });
      expect(sentryCaptureException).toHaveBeenCalledWith(err, {
        extra: { user_id: "u-1" },
      });
    });

    it("buffers captureException calls made before init resolves, then drains to Sentry", async () => {
      const { initSentry, captureException } = await import("./sentry");
      // Render-phase errors fire before the lazy @sentry/react import lands.
      // Without buffering, those would be silently dropped on slow networks.
      captureException(new Error("early"), { phase: "render" });
      expect(sentryCaptureException).not.toHaveBeenCalled();
      await initSentry();
      expect(sentryCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "early" }),
        { extra: { phase: "render" } },
      );
    });

    it("captureException without context omits the extra object", async () => {
      const { initSentry, captureException } = await import("./sentry");
      await initSentry();
      captureException(new Error("simple"));
      expect(sentryCaptureException).toHaveBeenCalledWith(expect.any(Error), undefined);
    });

    it("beforeSend filters AbortError so navigation cancellations aren't reported", async () => {
      const { initSentry } = await import("./sentry");
      await initSentry();
      const beforeSend = sentryInit.mock.calls[0][0].beforeSend;
      const abortErr = Object.assign(new Error("cancelled"), { name: "AbortError" });
      const result = beforeSend({ event: "x" }, { originalException: abortErr });
      expect(result).toBeNull();
    });

    it("beforeSend allows real errors through unchanged", async () => {
      const { initSentry } = await import("./sentry");
      await initSentry();
      const beforeSend = sentryInit.mock.calls[0][0].beforeSend;
      const realErr = new Error("genuine failure");
      const event = { event: "x" };
      const result = beforeSend(event, { originalException: realErr });
      expect(result).toBe(event);
    });

    it("uses default 0.1 sample rate when VITE_SENTRY_TRACES_SAMPLE_RATE is absent", async () => {
      vi.unstubAllEnvs();
      vi.stubEnv("VITE_SENTRY_DSN", "https://example@sentry.io/12345");
      const { initSentry } = await import("./sentry");
      await initSentry();
      expect(sentryInit.mock.calls[0][0].tracesSampleRate).toBe(0.1);
    });

    it("falls back to console.error if Sentry.init throws (SDK loaded but init failed)", async () => {
      // Regression: a thrown init left state stuck on "pending" so all
      // future captureException calls silently appended to the bounded
      // queue and never flushed to anywhere observable.
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      sentryInit.mockImplementationOnce(() => { throw new Error("bad DSN format"); });
      const { initSentry, captureException } = await import("./sentry");
      // Buffer a call before init runs.
      captureException(new Error("early"), { phase: "render" });
      await initSentry();
      // The thrown init should have transitioned state → noop and
      // drained the queue to console, not Sentry.
      expect(sentryCaptureException).not.toHaveBeenCalled();
      // Also covers the ongoing "noop" path: post-init calls go straight
      // to console rather than being silently buffered forever.
      captureException(new Error("post-init"), { phase: "click" });
      // Two console errors for the captured exceptions plus one for the
      // SDK-init failure log line.
      expect(consoleSpy).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });

    it("falls back to console.error if the lazy @sentry/react chunk fails to load", async () => {
      // Use vi.doMock to inject an import-failing mock for this test only.
      vi.resetModules();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.doMock("@sentry/react", () => {
        throw new Error("chunk load failed (network blocked)");
      });
      try {
        const { initSentry, captureException } = await import("./sentry");
        captureException(new Error("early"));
        await initSentry();
        // No Sentry call (we're using the per-test doMock that throws),
        // and post-init calls now hit console directly.
        captureException(new Error("post-init"));
        // 1 for the load-failure log line + 2 captured errors.
        expect(consoleSpy).toHaveBeenCalledTimes(3);
      } finally {
        vi.doUnmock("@sentry/react");
        consoleSpy.mockRestore();
      }
    });
  });
});
