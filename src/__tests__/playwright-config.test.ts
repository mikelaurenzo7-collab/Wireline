import { describe, expect, it } from "vitest";
import { buildPlaywrightWebServerEnv } from "../../scripts/playwright-env";

describe("Playwright config", () => {
  it("provides safe local env defaults so webServer can boot in fresh clones", () => {
    const env = buildPlaywrightWebServerEnv({});

    expect(env.INTERNAL_JWT_SECRET).toMatch(/^playwright-local-jwt-secret/);
    expect(env.OAUTH_STATE_SECRET).toMatch(/^playwright-local-oauth-state-secret/);
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("preserves explicit E2E env values", () => {
    const env = buildPlaywrightWebServerEnv({
      INTERNAL_JWT_SECRET: "explicit-jwt-secret",
      OAUTH_STATE_SECRET: "explicit-oauth-secret",
      APP_URL: "https://preview.example.com",
    });

    expect(env.INTERNAL_JWT_SECRET).toBe("explicit-jwt-secret");
    expect(env.OAUTH_STATE_SECRET).toBe("explicit-oauth-secret");
    expect(env.APP_URL).toBe("https://preview.example.com");
  });
});
