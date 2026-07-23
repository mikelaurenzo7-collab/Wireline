import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCSP } from "../src/lib/csp";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("security hardening contract", () => {
  it("auth limiters refuse when no distributed limiter is configured", () => {
    const mw = read("src/middleware/rate-limit-middleware.ts");
    expect(mw).toContain("distributedLimiterStatus");
    // The three credential-facing limiters must call the guard.
    for (const fn of ["signinRateLimiter", "signupRateLimiter", "forgotPasswordRateLimiter"]) {
      const start = mw.indexOf(`export async function ${fn}`);
      expect(start).toBeGreaterThan(-1);
      expect(mw.slice(start, start + 260)).toContain("refusedForNoDistributedLimiter");
    }
  });

  it("outbound webhook delivery does not follow redirects (SSRF)", () => {
    const helpers = read("src/lib/webhook-helpers.ts");
    expect(helpers).toContain('redirect: "manual"');
    // A 3xx is never counted as a delivered webhook.
    expect(helpers).toContain("res.status < 300 || res.status >= 400");
  });

  it("escalation binds the tenant to the invoked number, not a body field", () => {
    const routes = read("src/routes/escalation-routes.ts");
    // Number owner is authoritative; the claimed id is only a validated fallback.
    expect(routes).toContain("schema.phoneNumbers.phoneNumber");
    expect(routes).toContain("claimedTenantId");
    // All tenant writes run inside tenant context so RLS WITH CHECK applies.
    expect(routes).toContain("tenantStore.run(tenantUserId");
  });

  it("CSP denies plugin/embed vectors explicitly", () => {
    const csp = buildCSP(false, undefined, "'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // vercel.json header stays in sync with the source-of-truth builder.
    expect(read("vercel.json")).toContain("object-src 'none'");
  });
});
