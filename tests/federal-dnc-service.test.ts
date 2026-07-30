import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertFederalDncForMarketing,
  isFederalDncListed,
  isFederalDncVendorConfigured,
  lookupFederalDnc,
  normalizeUsPhone10,
} from "../src/lib/federal-dnc-service";

describe("federal-dnc-service", () => {
  beforeEach(() => {
    // Vercel preview builds can inherit production-scoped vendor credentials.
    // Keep these unit tests deterministic and prevent accidental live lookups.
    vi.stubEnv("FEDERAL_DNC_API_KEY", "");
    vi.stubEnv("FEDERAL_DNC_API_URL", "");
    vi.stubEnv("FEDERAL_DNC_PROVIDER", "");
    vi.stubEnv("FEDERAL_DNC_ALLOW_UNCONFIGURED", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns unconfigured when vendor env is missing", async () => {
    const result = await lookupFederalDnc("+15551234567");
    expect(result.listed).toBe(false);
    expect(result.source).toBe("unconfigured");
    expect(isFederalDncVendorConfigured()).toBe(false);
    expect(await isFederalDncListed("+15551234567")).toBe(false);
  });

  it("fails closed when vendor is configured but lookup errors", async () => {
    process.env.FEDERAL_DNC_API_URL = "https://dnc.example.com/check";
    process.env.FEDERAL_DNC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await lookupFederalDnc("+15551234567");
    expect(result.source).toBe("error");
    expect(result.listed).toBe(true);
    expect(await isFederalDncListed("+15551234567")).toBe(true);
  });

  it("uses DNCScrub GET auth and fails closed outside documented callable codes", async () => {
    process.env.FEDERAL_DNC_API_URL = "https://www.dncscrub.com/app/main/rpc/scrub";
    process.env.FEDERAL_DNC_API_KEY = "scrub-login-id";
    process.env.FEDERAL_DNC_PROVIDER = "dncscrub";

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(normalizeUsPhone10("+1 (555) 123-4567")).toBe("5551234567");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ Phone: "5551234567", ResultCode: "C" }],
    });
    const clear = await lookupFederalDnc("+15551234567");
    expect(clear.source).toBe("vendor");
    expect(clear.listed).toBe(false);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("phoneList=5551234567");
    expect(url).toContain("version=5");
    expect(url).toContain("output=json");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toMatchObject({ loginId: "scrub-login-id" });
    expect(init?.headers).not.toHaveProperty("Authorization");

    for (const resultCode of ["E", "G", "H", "O", "W", "X", "Y"]) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Phone: "5551234567", ResultCode: resultCode }],
      });
      expect((await lookupFederalDnc("+15551234567")).listed).toBe(false);
    }

    for (const resultCode of ["D", "P", "B", "I", "M", "L", "F", "V", "", "UNKNOWN"]) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Phone: "5551234567", ResultCode: resultCode }],
      });
      expect((await lookupFederalDnc("+15551234567")).listed).toBe(true);
    }

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    expect((await lookupFederalDnc("+15551234567")).listed).toBe(true);
  });

  it("treats misplaced Vercel tokens as unconfigured", () => {
    process.env.FEDERAL_DNC_API_URL = "https://www.dncscrub.com/app/main/rpc/scrub";
    process.env.FEDERAL_DNC_API_KEY = "vcp_notARealDncKey";
    expect(isFederalDncVendorConfigured()).toBe(false);
  });

  it("requires https vendor URL", () => {
    process.env.FEDERAL_DNC_API_URL = "http://www.dncscrub.com/app/main/rpc/scrub";
    process.env.FEDERAL_DNC_API_KEY = "scrub-login-id";
    expect(isFederalDncVendorConfigured()).toBe(false);
  });

  it("blocks marketing outbound when vendor is not configured in production", () => {
    process.env.NODE_ENV = "production";
    const gate = assertFederalDncForMarketing();
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("FEDERAL_DNC_NOT_CONFIGURED");
  });

  it("allows marketing outbound in dev when explicitly opted in", () => {
    process.env.FEDERAL_DNC_ALLOW_UNCONFIGURED = "true";
    expect(assertFederalDncForMarketing().allowed).toBe(true);
  });
});