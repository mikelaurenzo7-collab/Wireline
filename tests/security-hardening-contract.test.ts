import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCSP } from "../src/lib/csp";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// Exact-head release gate: assertions describe security semantics, not incidental local names.
describe("security hardening contract", () => {
  it("auth limiters refuse when no distributed limiter is configured", () => {
    const mw = read("src/middleware/rate-limit-middleware.ts");
    expect(mw).toContain("distributedLimiterStatus");
    for (const fn of ["signinRateLimiter", "signupRateLimiter", "forgotPasswordRateLimiter"]) {
      const start = mw.indexOf(`export async function ${fn}`);
      expect(start).toBeGreaterThan(-1);
      expect(mw.slice(start, start + 260)).toContain("refusedForNoDistributedLimiter");
    }
  });

  it("outbound webhook delivery does not follow or count redirects (SSRF)", () => {
    const helpers = read("src/lib/webhook-helpers.ts");
    const transport = read("src/lib/safe-webhook-delivery.ts");
    expect(helpers).toContain("let success = false");
    expect(helpers).toContain('lastError = "redirect_blocked"');

    const redirectBranch = helpers.slice(
      helpers.indexOf("if (response.redirect)"),
      helpers.indexOf("} else {", helpers.indexOf("if (response.redirect)")),
    );
    expect(redirectBranch).not.toContain("success = true");
    expect(helpers).toContain("success = response.ok");

    // The DNS-pinned transport issues one raw HTTPS request, which cannot
    // follow redirects, and classifies every 3xx for the caller to block.
    expect(transport).toContain("https.request(");
    expect(transport).toContain("redirect: statusCode >= 300 && statusCode < 400");
  });

  it("escalation binds the tenant to the invoked number, not a body field", () => {
    const routes = read("src/routes/escalation-routes.ts");
    expect(routes).toContain("schema.phoneNumbers.phoneNumber");
    expect(routes).toContain("tenantUserId = owner.userId");
    expect(routes).toContain("tenantStore.run(tenantUserId");
    // A valid shared webhook secret plus an arbitrary UUID must never write
    // into another tenant's inbox: no existence-check fallback remains.
    expect(routes).not.toContain("tenantUserId = validUser.id");
    expect(routes).not.toContain("if (!tenantUserId && claimedTenantId)");
  });

  it("CSP denies plugin/embed vectors explicitly", () => {
    const csp = buildCSP(false, undefined, "'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(read("vercel.json")).toContain("object-src 'none'");
  });
});
