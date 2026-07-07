import { afterEach, describe, expect, it, vi } from "vitest";
import { isFederalDncListed, lookupFederalDnc } from "../src/lib/federal-dnc-service";

describe("federal-dnc-service", () => {
  afterEach(() => {
    delete process.env.FEDERAL_DNC_API_KEY;
    delete process.env.FEDERAL_DNC_API_URL;
  });

  it("returns unconfigured when vendor env is missing", async () => {
    const result = await lookupFederalDnc("+15551234567");
    expect(result.listed).toBe(false);
    expect(result.source).toBe("unconfigured");
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
});
