import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Cross-domain audit round three. Each block pins one verified defect where a
 * boundary was drawn in the wrong place: a credential that outlived the event
 * that should have killed it, a limiter counting the wrong thing, a spend
 * dimension that measured without bounding, or an upstream failure wearing the
 * tenant's identity.
 *
 * Source-reading where the invariant is structural, behavioral where the unit
 * is pure — matching the repository's existing contract style.
 */

describe("sign-in spray and stuffing are bounded, not just repeat guessing", () => {
  const middleware = read("src/middleware/rate-limit-middleware.ts");
  const authRoutes = read("src/routes/auth-routes.ts");

  it("keeps failure-only budgets for the IP and the email dimension", () => {
    // The per-(email, IP) key bounds neither sweep: both vary the email, so
    // every attempt lands in a fresh bucket and nothing is counted.
    expect(middleware).toContain("SIGNIN_IP_FAILURE_MAX");
    expect(middleware).toContain("SIGNIN_EMAIL_FAILURE_MAX");
    expect(middleware).toContain("export async function recordSigninFailure");
  });

  it("peeks the budgets on entry instead of incrementing them", () => {
    // Incrementing on entry would lock out a shared-NAT office signing in
    // correctly — the whole point is that only failures cost anything.
    const limiter = middleware.slice(middleware.indexOf("export async function signinRateLimiter"));
    expect(limiter).toContain("peekRateLimit");
    expect(limiter.slice(0, limiter.indexOf("const result = await rateLimit"))).not.toContain(
      "await rateLimit(",
    );
  });

  it("spends a failure budget from the 401 path, or the buckets never move", () => {
    expect(authRoutes).toContain("recordSigninFailure");
    const signinHandler = authRoutes.slice(
      authRoutes.indexOf('"/api/auth/signin"'),
      authRoutes.indexOf('"/api/auth/signup"'),
    );
    const failureBranch = signinHandler.slice(signinHandler.indexOf("if (!result)"));
    expect(failureBranch).toContain("recordSigninFailure");
    // The remote counter writes must finish before a serverless response can
    // freeze the invocation. The recorder catches failures, so awaiting it
    // preserves the 401 contract while making the budget durable.
    expect(failureBranch).toContain("await recordSigninFailure");
    expect(failureBranch).not.toContain("void recordSigninFailure");
    expect(failureBranch.indexOf("await recordSigninFailure")).toBeLessThan(
      failureBranch.indexOf("throw AppError.fromHttpStatus(401"),
    );
  });

  it("never records a failure on the success path", () => {
    const signinHandler = read("src/routes/auth-routes.ts").slice(
      read("src/routes/auth-routes.ts").indexOf('"/api/auth/signin"'),
    );
    const successBranch = signinHandler.slice(
      signinHandler.indexOf("scheduleFounderBootstrap"),
      signinHandler.indexOf("} catch (error) {"),
    );
    expect(successBranch).not.toContain("recordSigninFailure");
  });
});

describe("peekRateLimit reads a bucket without pushing it further over", () => {
  const source = read("src/lib/rate-limit.ts");

  it("uses a plain read, never an increment", () => {
    const peek = source.slice(source.indexOf("export async function peekRateLimit"));
    expect(peek).toContain("r.get(composite)");
    expect(peek).not.toContain("r.incr");
    expect(peek).not.toContain("r.incrby");
  });

  it("keeps the same fail-closed posture as rateLimit", () => {
    const peek = source.slice(source.indexOf("export async function peekRateLimit"));
    expect(peek).toContain("opts.failClosedOnError");
  });
});

describe("the Claude limiter keys on identity, not on a raw credential", () => {
  const source = read("src/middleware/api-rate-limits.ts");

  it("prefers the authenticated user id", () => {
    const key = source.slice(
      source.indexOf("function claudeRateLimitKey"),
      source.indexOf("export async function claudeRateLimiter"),
    );
    expect(key).toContain("user?.id");
    expect(key.indexOf("user?.id")).toBeLessThan(key.indexOf("getSessionTokenFromRequest"));
  });

  it("reads the cookie too, so browser sessions are not all collapsed onto one IP bucket", () => {
    // The browser authenticates by cookie and sends no Authorization header.
    // Reading only the header put every cookie caller behind one NAT, CDN
    // egress, or carrier CGNAT into a single shared 60/min bucket.
    const key = source.slice(
      source.indexOf("function claudeRateLimitKey"),
      source.indexOf("export async function claudeRateLimiter"),
    );
    expect(key).toContain("getSessionTokenFromRequest");
  });

  it("never writes a live session token into the limiter key", () => {
    const key = source.slice(
      source.indexOf("function claudeRateLimitKey"),
      source.indexOf("export async function claudeRateLimiter"),
    );
    expect(key).toContain("createHash");
    expect(key).toContain("sha256");
    // The old form: `req.headers.authorization?.split(" ")[1]` used verbatim.
    expect(source).not.toContain('const token = req.headers.authorization?.split(" ")[1]');
  });

  it("authenticates before throttling on the routes that can", () => {
    const handoff = read("src/routes/browser-handoff-routes.ts");
    for (const route of ["/api/browser/handoff/exchange", "/api/browser/handoff/redeem"]) {
      const mount = handoff.slice(handoff.indexOf(route));
      expect(mount.indexOf("authenticateUser")).toBeLessThan(mount.indexOf("claudeRateLimiter"));
    }
  });
});

describe("the daily AI-token dimension bounds spend instead of only counting it", () => {
  const source = read("src/middleware/audit-middleware.ts");

  it("checks the ceiling before the model call, inside withAudit", () => {
    // Enforcement lives in withAudit rather than a sibling middleware so a
    // route that meters its spend respects the ceiling by construction.
    const withAudit = source.slice(source.indexOf("export function withAudit"));
    expect(withAudit).toContain("aiTokenQuotaExceeded");
    expect(withAudit).toContain("AI_TOKEN_QUOTA_EXCEEDED");
    expect(withAudit).toContain("429");
    // The gate must run before the audit context is established and next() is
    // called, or the model call has already happened.
    expect(withAudit.indexOf("aiTokenQuotaExceeded")).toBeLessThan(
      withAudit.indexOf("createAuditContext()"),
    );
  });

  it("reads usage without incrementing, leaving the audit path the single writer", () => {
    const check = source.slice(
      source.indexOf("async function aiTokenQuotaExceeded"),
      source.indexOf("export function withAudit"),
    );
    expect(check).toContain("quotaTracker.getUsage");
    expect(check).not.toContain("checkAndIncrement");
  });

  it("fails open on a counter-store error rather than taking every tenant offline", () => {
    const check = source.slice(
      source.indexOf("async function aiTokenQuotaExceeded"),
      source.indexOf("export function withAudit"),
    );
    expect(check).toContain("catch");
    expect(check).toContain("return null");
  });
});

describe("a provider's auth failure is never dressed up as the tenant's", () => {
  const helper = read("src/lib/provider-http-error.ts");

  it("maps platform credential failures to 502, never through to the caller", () => {
    // The browser force-signs-out on any 401, so passing a provider 401 through
    // would eject the account holder over a key rotation they cannot see.
    expect(helper).toContain("isPlatformCredentialFailure");
    expect(helper).toContain("status === 401");
    expect(helper).toContain("status === 403");
    expect(helper).toContain("status === 402");
    const branch = helper.slice(helper.indexOf("if (isPlatformCredentialFailure(status))"));
    expect(branch.slice(0, branch.indexOf("}\n\n"))).toContain("AppError.fromHttpStatus(502");
  });

  it("does not reflect the provider's own message on the credential path", () => {
    const branch = helper.slice(
      helper.indexOf("if (isPlatformCredentialFailure(status))"),
      helper.indexOf("if (status === 429)"),
    );
    expect(branch).toContain("unavailableMessage");
    expect(branch).not.toContain("detail ||");
  });

  it("routes all three provider clients through it", () => {
    for (const path of [
      "src/lib/video-presenter/liveavatar-service.ts",
      "src/lib/video-presenter/heygen-voice-service.ts",
      "src/lib/voice/openai-realtime-service.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("providerHttpError");
      // The old shape: reuse the provider's status for anything under 500.
      expect(source).not.toContain("response.status >= 500 ? 502 : response.status");
    }
  });
});

describe("password reset rotates every credential the account holds", () => {
  const authService = read("src/lib/auth-service.ts");
  const reset = authService.slice(authService.indexOf("async completePasswordReset"));

  it("bumps the session generation instead of only reading it", () => {
    // Reading it left every open session authenticated on the old password —
    // the exact sessions a reset is performed to evict.
    expect(reset).toContain("sessionUsers.sessionVersion} + 1");
    expect(reset).toContain("sessionRevokedBefore");
    expect(reset).toContain("returning({ sessionVersion");
  });

  it("rotates inside the same transaction as the password write", () => {
    const txn = reset.slice(
      reset.indexOf("await drizzle.transaction"),
      reset.indexOf("if (!reset) return null;"),
    );
    expect(txn).toContain("sessionUsers.sessionVersion} + 1");
  });

  it("revokes MCP grants, which the session fence cannot reach", () => {
    expect(reset).toContain("revokeAllMcpGrantsForUser");
  });

  it("drops refresh tokens and in-flight codes, not just access tokens", () => {
    const security = read("src/lib/mcp-oauth-security.ts");
    const revoke = security.slice(
      security.indexOf("export async function revokeAllMcpGrantsForUser"),
    );
    expect(revoke).toContain("wireline_mcp_access_tokens");
    expect(revoke).toContain("wireline_mcp_refresh_tokens");
    expect(revoke).toContain("wireline_mcp_oauth_codes");
  });
});

describe("a transient webhook DNS failure retries like any other transient failure", () => {
  const source = read("src/lib/webhook-helpers.ts");

  it("separates permanent blocks from retryable ones", () => {
    expect(source).toContain("function blockIsPermanent");
    const fn = source.slice(
      source.indexOf("function blockIsPermanent"),
      source.indexOf("export async function attemptWebhookDelivery"),
    );
    expect(fn).toContain('reason !== "dns_resolution_failed"');
  });

  it("only abandons the delivery when the block is permanent", () => {
    const arm = source.slice(
      source.indexOf('if (response.status === "blocked")'),
      source.indexOf("statusCode = response.statusCode;"),
    );
    expect(arm).toContain("if (blockIsPermanent(response.reason))");
    // nextAttemptAt: null belongs inside the permanent branch only.
    expect(arm.indexOf("if (blockIsPermanent(response.reason))")).toBeLessThan(
      arm.indexOf("nextAttemptAt: null"),
    );
  });
});

describe("the enrichment SLO reports the window, not the lifetime", () => {
  const source = read("src/lib/operator-slos.ts");

  it("counts dead jobs inside the window", () => {
    expect(source).toContain("export async function getDeadJobsInWindow");
    const fn = source.slice(
      source.indexOf("export async function getDeadJobsInWindow"),
      source.indexOf("export async function getPlatformWebhookStats"),
    );
    expect(fn).toContain("gte(schema.jobs.finishedAt, since)");
  });

  it("never feeds the all-time queue.dead count into the windowed dimension", () => {
    // queue.dead is lifetime; past six it pinned the dimension to critical
    // forever and fired the same webhook on every evaluation.
    expect(source).not.toContain("deadEnrichmentWindow: queue.dead");
  });

  it("windows the per-tenant enrichment dead count too", () => {
    const perTenant = source.slice(source.indexOf('eq(schema.jobs.type, "post_call_enrichment")'));
    const deadQuery = perTenant.slice(perTenant.indexOf('eq(schema.jobs.status, "dead")'));
    // Bounded to this one .where(...) clause so the assertion cannot be
    // satisfied by the "done" count that follows it.
    expect(deadQuery.slice(0, deadQuery.indexOf("),\n      ),"))).toContain(
      "gte(schema.jobs.finishedAt, since)",
    );
  });
});

describe("Studio only clears the essentials box when something was stored", () => {
  const source = read("src/components/StudioAgentWorkspacePanel.tsx");

  it("reads the readiness counts rather than trusting the 200", () => {
    // /api/train/extract answers 200 whether it extracted ten facts or none —
    // its own prompt tells it to return empty arrays when unclear.
    expect(source).toContain("extractionPersistedSomething");
    const check = source.slice(source.indexOf("async function extractionPersistedSomething"));
    expect(check).toContain("readiness");
  });

  it("keeps the Account Holder's typing when nothing was captured", () => {
    const apply = source.slice(source.indexOf("async function applySetup"));
    const guard = apply.slice(apply.indexOf("knowledgeCaptured = await"));
    expect(guard).toContain('if (knowledgeCaptured && isCurrentAgent()) setSetupKnowledge("")');
    expect(apply).toContain("if (!knowledgeCaptured)");
  });

  it("does not claim the setup is ready to test when the facts were dropped", () => {
    const apply = source.slice(source.indexOf("async function applySetup"));
    const notCaptured = apply.slice(apply.indexOf("if (!knowledgeCaptured)"));
    expect(notCaptured.slice(0, notCaptured.indexOf("setSetupNotice(\n"))).toContain(
      "setSetupError",
    );
  });
});

describe("the Live Video SDK is not downloaded by people who never start a session", () => {
  const page = read("src/pages/LiveVideoStudioPage.tsx");

  it("loads the presenter lazily", () => {
    expect(page).toContain('lazy(() => import("../components/LiveVideoPresenter"))');
    // Only the type may remain static.
    expect(page).toContain(
      'import type { LiveVideoPresenterHandle } from "../components/LiveVideoPresenter"',
    );
    expect(page).not.toContain("import LiveVideoPresenter, {");
  });

  it("warms the chunk alongside the mint so the boundary rarely shows", () => {
    const start = page.slice(page.indexOf("async function startPreview"));
    expect(start.slice(0, start.indexOf("setSessionBusy(true)"))).toContain(
      "warmPresenterBundle()",
    );
  });

  it("renders the presenter behind a Suspense boundary", () => {
    expect(page).toContain("<Suspense fallback={<PresenterLoadingStage />}>");
  });
});

describe("device registration cannot claim another account's push tokens", () => {
  const source = read("src/routes/mobile-routes.ts");
  const register = source.slice(source.indexOf("claimedTokens"));

  it("evicts rows belonging to other users in the same transaction as the insert", () => {
    expect(register).toContain("drizzle.transaction");
    expect(register).toContain("ne(schema.mobileDevices.userId, req.user.id)");
    expect(register.indexOf(".delete(schema.mobileDevices)")).toBeGreaterThan(-1);
    expect(register.indexOf(".delete(schema.mobileDevices)")).toBeLessThan(
      register.indexOf(".insert(schema.mobileDevices)"),
    );
  });

  it("matches on every token column, not just the device id", () => {
    expect(register).toContain("apnsVoipToken");
    expect(register).toContain("apnsAlertToken");
    expect(register).toContain("fcmToken");
  });
});
