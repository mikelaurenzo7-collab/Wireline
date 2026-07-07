import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertFederalDncForMarketing,
  isFederalDncListed,
  isFederalDncVendorConfigured,
  lookupFederalDnc,
} from "../src/lib/federal-dnc-service";

describe("federal-dnc-service", () => {
  afterEach(() => {
    delete process.env.FEDERAL_DNC_API_KEY;
    delete process.env.FEDERAL_DNC_API_URL;
    delete process.env.FEDERAL_DNC_ALLOW_UNCONFIGURED;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
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
    vi.unstubAllGlobals();
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
