import { afterEach, describe, expect, it } from "vitest";
import { loadPlatformIntegrationFlags } from "./platform-integration-flags";

describe("loadPlatformIntegrationFlags", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("detects apollo from API key", () => {
    process.env.APOLLO_API_KEY = "test-key";
    delete process.env.APOLLO_CLIENT_ID;
    delete process.env.APOLLO_CLIENT_SECRET;
    expect(loadPlatformIntegrationFlags().apollo).toBe(true);
  });

  it("detects docusign when account and jwt present", () => {
    process.env.DOCUSIGN_ACCOUNT_ID = "acct";
    process.env.DOCUSIGN_JWT_TOKEN = "jwt";
    expect(loadPlatformIntegrationFlags().docusign).toBe(true);
  });
});
