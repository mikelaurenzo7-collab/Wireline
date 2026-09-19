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
    expect(admin).toContain("if (!settingsRes.ok || !agentsRes.ok)");
    expect(admin).toContain("finally {\n      setIsLoading(false);");
    expect(admin).toContain("numbersRes.ok && !numbersJson?.degraded");
    expect(admin).toContain("if (!res.ok)");
    expect(admin).toContain("Could not fetch available BotBound phone numbers.");
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
    expect(inbox).toContain(
      'authFetch("/api/triage", { signal: controller.signal }).catch(() => null)',
    );
    expect(inbox).toContain(
      'authFetch("/api/Assistants/tasks?status=active", { signal: controller.signal })',
    );
    expect(inbox).toContain("parseTriageBucket(triageBody)");
    expect(inbox).toContain("parseApprovalTasks(tasksBody)");
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

  it("uses Bot on customer-facing onboarding while retaining agent in technical and legal domains", () => {
    const email = read("src/lib/email-service.ts");
    const compare = read("src/pages/Compare.tsx");
    const apps = read("src/pages/ClientAppsPage.tsx");
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    const productCopy = read("src/lib/product-copy.ts");

    expect(email).not.toContain("first AI employee");
    expect(compare).not.toContain("AI call agent");
    expect(apps).toContain("privately rehearse your Phone Bot");
    expect(apps).toContain("first Phone Bot");
    expect(apps).not.toContain("first voice agent");
    expect(privacy).toMatch(/operates a Bot platform for calls,\s+texts, and email/);
    expect(privacy).toContain("primarily through <strong>OpenAI</strong>");
    expect(privacy).toContain("<strong>OpenAI</strong>: Primary managed structured inference");
    expect(privacy).not.toContain(
      "process managed AI requests primarily\n              through xAI",
    );
    expect(productCopy).toContain(
      "Technical routes, schemas, events, and APIs retain `agent` for compatibility",
    );
    expect(productCopy).toContain('productNoun: "Bot"');
  });
});
