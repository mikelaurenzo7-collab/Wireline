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
    vi.stubEnv("FEDERAL_DNC_API_KEY", "");
    vi.stubEnv("FEDERAL_DNC_API_URL", "");
    vi.stubEnv("FEDERAL_DNC_PROVIDER", "");
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

    for (const payload of [
      [],
      [null],
      [{}],
      [{ ResultCode: "UNKNOWN" }],
      [{ ResultCode: "C" }, { ResultCode: "D" }],
    ]) {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
      expect(await lookupFederalDnc("+15551234567")).toMatchObject({
        listed: true,
        source: "error",
      });
    }
  });

  it("screens with the seller's own DNCScrub project when one is given", async () => {
    process.env.FEDERAL_DNC_API_URL = "https://www.dncscrub.com/app/main/rpc/scrub";
    process.env.FEDERAL_DNC_API_KEY = "scrub-login-id";
    process.env.FEDERAL_DNC_PROVIDER = "dncscrub";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ Phone: "5551234567", ResultCode: "C" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await lookupFederalDnc("+15551234567", { vendorProjectId: "proj-acme" });
    expect(fetchMock.mock.calls[0][0]).toContain("projId=proj-acme");

    await lookupFederalDnc("+15551234567");
    expect(fetchMock.mock.calls[1][0]).not.toContain("projId");
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

  it("fails marketing outbound closed when vendor credentials are missing", () => {
    process.env.NODE_ENV = "production";
    const gate = assertFederalDncForMarketing();
    expect(gate.allowed).toBe(false);
    expect(gate.configured).toBe(false);
    if (gate.allowed) return;
    expect(gate.code).toBe("FEDERAL_DNC_NOT_CONFIGURED");
    expect(gate.message).toContain("must be configured");
  });

  it("reports configured when federal screening credentials are valid", () => {
    process.env.FEDERAL_DNC_API_URL = "https://dnc.example.com/check";
    process.env.FEDERAL_DNC_API_KEY = "test-key";
    const gate = assertFederalDncForMarketing();
    expect(gate.allowed).toBe(true);
    expect(gate.configured).toBe(true);
  });
});
