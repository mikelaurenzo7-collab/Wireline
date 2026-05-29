import { describe, expect, it } from "vitest";
import {
  parseSentryDsn,
  buildSentryAuthHeader,
  buildSentryStorePayload,
  reportError,
} from "./error-reporter";

describe("error-reporter", () => {
  describe("parseSentryDsn", () => {
    it("parses a modern DSN (public key only) into the store endpoint", () => {
      const parsed = parseSentryDsn("https://abc123@o456.ingest.sentry.io/789");
      expect(parsed).toEqual({
        publicKey: "abc123",
        storeUrl: "https://o456.ingest.sentry.io/api/789/store/",
      });
    });

    it("parses a legacy DSN (public:secret) and keeps the public key", () => {
      const parsed = parseSentryDsn("https://pub:sec@sentry.example.com/42");
      expect(parsed?.publicKey).toBe("pub");
      expect(parsed?.storeUrl).toBe("https://sentry.example.com/api/42/store/");
    });

    it("returns null for empty / missing DSN", () => {
      expect(parseSentryDsn(undefined)).toBeNull();
      expect(parseSentryDsn(null)).toBeNull();
      expect(parseSentryDsn("")).toBeNull();
    });

    it("returns null when there is no project id", () => {
      expect(parseSentryDsn("https://abc123@o456.ingest.sentry.io/")).toBeNull();
    });

    it("returns null when there is no public key", () => {
      expect(parseSentryDsn("https://o456.ingest.sentry.io/789")).toBeNull();
    });

    it("returns null for unparseable input rather than throwing", () => {
      expect(parseSentryDsn("not a url")).toBeNull();
    });
  });

  describe("buildSentryAuthHeader", () => {
    it("includes the version, client, and key", () => {
      const h = buildSentryAuthHeader("mykey");
      expect(h).toContain("sentry_version=7");
      expect(h).toContain("sentry_key=mykey");
      expect(h).toContain("sentry_client=wireline-server/1.0");
    });
  });

  describe("buildSentryStorePayload", () => {
    it("captures the error type, message, and a 32-char event id", () => {
      const payload = buildSentryStorePayload(new TypeError("boom")) as any;
      expect(payload.platform).toBe("node");
      expect(payload.level).toBe("error");
      expect(payload.exception.values[0].type).toBe("TypeError");
      expect(payload.exception.values[0].value).toBe("boom");
      expect(payload.event_id).toMatch(/^[0-9a-f]{32}$/);
    });

    it("coerces non-Error throwables into a usable message (no synthetic stack)", () => {
      const payload = buildSentryStorePayload("just a string") as any;
      expect(payload.exception.values[0].value).toContain("just a string");
      // A non-Error throwable must not carry a misleading reporter-site stack.
      expect(payload.extra).toBeUndefined();
    });

    it("splits context into tags (stringified) and extra, and attaches a real stack", () => {
      const payload = buildSentryStorePayload(new Error("x"), {
        tags: { source: "job_queue", attempts: 3, flag: true, skip: null },
        userId: "u_1",
        callId: "c_2",
      }) as any;
      expect(payload.tags).toEqual({ source: "job_queue", attempts: "3", flag: "true" });
      expect(payload.extra).toMatchObject({ userId: "u_1", callId: "c_2" });
      expect(typeof payload.extra.stack).toBe("string");
    });

    it("attaches the real Error stack to extra even with no other context", () => {
      const payload = buildSentryStorePayload(new Error("x")) as any;
      expect(payload.tags).toBeUndefined();
      expect(typeof payload.extra.stack).toBe("string");
    });
  });

  describe("reportError", () => {
    it("is a no-op (does not throw) when SENTRY_DSN is unset", () => {
      const prev = process.env.SENTRY_DSN;
      delete process.env.SENTRY_DSN;
      expect(() => reportError(new Error("safe"), { tags: { a: "b" } })).not.toThrow();
      if (prev !== undefined) process.env.SENTRY_DSN = prev;
    });
  });
});
