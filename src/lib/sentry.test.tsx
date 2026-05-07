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

    it("captureException falls back to console.error when not initialized", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { captureException } = await import("./sentry");
      const err = new Error("local dev error");
      captureException(err, { route: "/agents" });
      expect(consoleSpy).toHaveBeenCalledWith("[wireline]", err, { route: "/agents" });
      expect(sentryCaptureException).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("captureException without context still falls back to console.error safely", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { captureException } = await import("./sentry");
      captureException(new Error("no context"));
      expect(consoleSpy).toHaveBeenCalled();
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
  });
});
