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
    const routes = read("src/routes/openai-sip-routes.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(routes).toContain("sipHeader(payload, OPENAI_INBOUND_SIP_TOKEN_HEADER)");
    expect(routes).toContain("verifyOpenAIInboundToken(inboundToken)");
    expect(routes).toContain("inboundVerification.claims.calledNumber");
    expect(routes).toContain("eq(schema.phoneNumbers.phoneNumber, calledNumber)");
    expect(routes).toContain("userId: line.userId");
    expect(routes).toContain("agentId: line.agentId");
    expect(session).toContain("return tenantStore.run(input.userId");
    // Tenant routing lives only in the shared admission step, which each
    // provider's webhook reaches strictly after its signature verifies.
    const admission = routes.slice(
      routes.indexOf("async function admitRealtimeCall("),
      routes.indexOf('router.post(\n  "/api/webhooks/openai/realtime"'),
    );
    expect(admission).toContain("await resolveInboundContext");
    for (const [path, rejection] of [
      ['"/api/webhooks/openai/realtime"', "Invalid OpenAI webhook signature."],
      ['"/api/webhooks/xai/realtime"', "Invalid xAI webhook signature."],
    ]) {
      const incoming = routes.slice(routes.indexOf(path), routes.indexOf("export default router"));
      const verification = incoming.indexOf("verifyStandardWebhook({");
      const unauthorized = incoming.indexOf("if (!verification.ok)", verification);
      const admit = incoming.indexOf("await admitRealtimeCall(", unauthorized);
      expect(verification, path).toBeGreaterThan(-1);
      expect(unauthorized, path).toBeGreaterThan(verification);
      expect(incoming.slice(unauthorized, admit), path).toContain(
        `throw AppError.unauthorized("${rejection}")`,
      );
      expect(admit, path).toBeGreaterThan(unauthorized);
    }
    // The signed provider event may carry a called number, but never accepts
    // a tenant or Bot identity from a request body field.
    expect(routes).not.toMatch(/req\.(?:body|query)\.(?:userId|agentId)/);
  });

  it("CSP denies plugin/embed vectors explicitly", () => {
    const csp = buildCSP(false, undefined, "'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(read("vercel.json")).toContain("object-src 'none'");
  });
});
