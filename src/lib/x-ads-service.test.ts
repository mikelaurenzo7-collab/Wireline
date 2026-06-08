import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { xAdsConfigured } from "./x-ads-service";

describe("x-ads-service", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.X_API_KEY;
    delete process.env.X_API_SECRET;
    delete process.env.X_ADS_ACCESS_TOKEN;
    delete process.env.X_ADS_ACCESS_TOKEN_SECRET;
    delete process.env.X_ADS_ACCOUNT_ID;
  });

  afterEach(() => {
    process.env = env;
  });

  it("xAdsConfigured is false until all five vars are set", () => {
    expect(xAdsConfigured()).toBe(false);
    process.env.X_API_KEY = "k";
    process.env.X_API_SECRET = "s";
    process.env.X_ADS_ACCESS_TOKEN = "at";
    process.env.X_ADS_ACCESS_TOKEN_SECRET = "ats";
    expect(xAdsConfigured()).toBe(false);
    process.env.X_ADS_ACCOUNT_ID = "act_1";
    expect(xAdsConfigured()).toBe(true);
  });
});
