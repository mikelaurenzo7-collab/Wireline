import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness fine-tune 2026-07-27", () => {
  it("AdminSettings does not mask phone or agent load failures as empty success", () => {
    const admin = read("src/components/AdminSettings.tsx");
    expect(admin).not.toContain(".catch(() => ({ numbers: [] }))");
    expect(admin).toContain("numbersJson?.degraded");
    expect(admin).toContain("Phone numbers unavailable");
    expect(admin).toContain("if (!res.ok)");
    expect(admin).toContain("Could not fetch available Wireline phone numbers.");
  });

  it("fails closed when carrier sync lacks the platform Vapi key", () => {
    const carrier = read("src/routes/carrier-routes.ts");
    const block = carrier.slice(
      carrier.indexOf('"/api/carrier/numbers"'),
      carrier.indexOf("export default router"),
    );
    expect(block).not.toMatch(
      /if\s*\(\s*!vapiSecret\s*\)\s*return\s+res\.json\(\s*\{\s*numbers:\s*\[\s*\]\s*\}\s*\)/,
    );
    expect(block).toContain("Voice carrier sync is temporarily unavailable");
    expect(block).toContain("AppError.fromHttpStatus(");
    expect(block).toContain("503");
  });

  it("OutcomeLedger and ApprovalInbox surface non-OK loads instead of silent empty lists", () => {
    const ledger = read("src/components/OutcomeLedger.tsx");
    const inbox = read("src/components/ApprovalInbox.tsx");
    expect(ledger).toContain("if (!callsRes.ok)");
    expect(ledger).toContain('setFatalError("Could not load outcome ledger.")');
    expect(ledger).toContain('setEnrichmentWarning("Follow-up status is temporarily incomplete.")');
    expect(ledger).not.toContain("callsRes.ok ? await callsRes.json() : { calls: [] }");
    expect(inbox).toContain("Could not load approval inbox.");
    expect(inbox).toContain("Could not load active operator work.");
    expect(inbox).toContain('authFetch("/api/triage").catch(() => null)');
    expect(inbox).toContain(
      'authFetch("/api/Assistants/tasks?status=active").catch(() => null)',
    );
    expect(inbox).not.toContain("tasksRes.ok ? await tasksRes.json() : { tasks: [] }");
  });

  it("hard-throws if the unsafe proactive enrichment base path is ever reached", () => {
    const base = read("src/lib/job-worker-base.ts");
    const block = base.slice(
      base.indexOf('if (job.type === "proactive_lead_enrichment")'),
      base.indexOf('if (job.type === "autonomous_prospecting")'),
    );
    expect(block).toContain("must be handled by the tenant-safe intercept");
    expect(block).not.toContain("eq(schema.callLogs.customerNumber, p.customerNumber)");
    expect(block).not.toContain("eq(schema.emailThreads.customerEmail, p.customerNumber)");
  });

  it("claims OAuth state nonces on every integration callback", () => {
    const helpers = read("src/lib/oauth-helpers.ts");
    expect(helpers).toContain("export async function verifyAndClaimOAuthState");
    expect(helpers).toContain("claimOAuthStateNonce");
    expect(helpers).toContain("wireline:oauth:state-nonce:");

    const oauthDir = [
      "google",
      "google-sheets",
      "microsoft",
      "microsoft-graph",
      "meta",
      "hubspot",
      "salesforce",
      "slack",
      "shopify",
      "square",
      "yahoo",
      "x",
      "zoom",
      "apollo",
    ];
    for (const name of oauthDir) {
      const src = read(`src/routes/oauth/${name}.ts`);
      expect(src).toContain("verifyAndClaimOAuthState");
      expect(src).toContain("await verifyAndClaimOAuthState");
      expect(src).not.toMatch(/const vs = verifyOAuthState\(/);
    }

    const authOauth = read("src/routes/auth-oauth-routes.ts");
    expect(authOauth).toContain("verifyAndClaimOAuthState");
    expect(authOauth).toContain("await verifyAndClaimOAuthState");
    expect(authOauth).not.toMatch(/const vs = verifyOAuthState\(/);
  });

  it("does not mask insights latency or analytics call failures as empty success", () => {
    const reliability = read("src/components/insights/VoiceReliabilityView.tsx");
    expect(reliability).not.toContain(".catch(\n        () => ({ calls: [] }),");
    expect(reliability).not.toContain("() => ({ calls: [] })");

    const analytics = read("src/components/CallOpsAnalytics.tsx");
    expect(analytics).toContain('setError("Could not load call analytics.")');
    expect(analytics).toContain("Analytics unavailable");
  });

  it("reports managed Vapi readiness instead of the dead tenant vapi_private_key column", () => {
    const settings = read("src/routes/settings-routes.ts");
    expect(settings).toContain("safe.has_vapi_key = Boolean(process.env.VAPI_PRIVATE_KEY?.trim())");
    expect(settings).toContain("platformVoiceReady && tenantHasNumber");
    expect(settings).not.toContain("has_voice: !!settingsRow?.vapiPrivateKey");
  });

  it("returns 200 { user: null } for anonymous session probes", () => {
    const auth = read("src/routes/auth-routes.ts");
    const session = auth.slice(
      auth.indexOf("GET /api/auth/session"),
      auth.indexOf("POST /api/auth/migrate-session"),
    );
    expect(session).toContain("return res.json({ user: null })");
    expect(session).not.toContain("authenticateUser");
    expect(session).toContain("getSessionTokenFromRequest");

    const consent = read("src/components/CookieConsent.tsx");
    expect(consent).toContain("sessionPresent = Boolean(body?.user)");
  });

  it("aligns broad public/onboarding copy to voice agent", () => {
    expect(read("src/lib/email-service.ts")).toContain("first voice agent");
    expect(read("src/lib/email-service.ts")).not.toContain("first AI employee");
    expect(read("src/pages/Compare.tsx")).toContain("owner ready voice agent");
    expect(read("src/pages/ClientAppsPage.tsx")).toContain("simulate a voice agent");
    expect(read("src/components/PrivacyPolicyPage.tsx")).toContain("voice agent platform");
    expect(read("src/components/PrivacyPolicyPage.tsx")).toContain("your voice agents");
    expect(read("src/components/StudioWorkroom.tsx")).toContain('"Voice agent"');
    expect(read("src/components/CallLogsClaude.tsx")).toContain('"Voice agent"');
  });
});
