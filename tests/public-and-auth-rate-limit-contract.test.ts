import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("public and authentication rate-limit contracts", () => {
  it("keeps the public plans route on an IP limiter instead of an auth-only limiter", () => {
    const quotas = read("src/routes/quota-routes.ts");
    expect(quotas).toContain("createIpRateLimiter");
    expect(quotas).toContain('bucket: "api:quotas:plans"');

    const plansLine = quotas.split("\n").find((line) => line.includes('router.get("/plans"'));
    expect(plansLine).toBeTruthy();
    expect(plansLine).toContain("plansPublicRateLimit");
    expect(plansLine).not.toContain("quotaRateLimit");
  });

  it("fails sensitive unauthenticated flows closed when no distributed limiter is available", () => {
    const middleware = read("src/middleware/rate-limit-middleware.ts");
    for (const functionName of [
      "resetPasswordRateLimiter",
      "resendVerificationRateLimiter",
      "migrateSessionRateLimiter",
    ]) {
      const start = middleware.indexOf(`export async function ${functionName}`);
      expect(start).toBeGreaterThan(-1);
      const body = middleware.slice(start, start + 900);
      expect(body).toContain("refusedForNoDistributedLimiter(res)");
      expect(body).toContain("authRateLimitOptions(");
    }
  });
});
