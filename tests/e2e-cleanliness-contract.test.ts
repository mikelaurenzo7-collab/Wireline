import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("E2E cleanliness contracts", () => {
  it("serves the advertised OpenAPI contract from /api/openapi.json", () => {
    const registry = read("src/server/register-api-routes.ts");
    const openapi = read("src/routes/openapi-routes.ts");
    const developers = read("src/pages/Developers.tsx");

    expect(registry).toContain('app.use("/api", openapiRouter)');
    expect(openapi).toContain('router.get("/openapi.json"');
    expect(developers).toContain("/api/openapi.json");
  });

  it("keeps OpenAI as the managed default for voice intelligence with the OpenAI structured fallback lane intact", () => {
    const models = read("src/lib/ai-models.ts");

    expect(models).toContain('VAPI_TENANT_DEFAULT_PROVIDER = "openai"');
    expect(models).toContain("VAPI_TENANT_DEFAULT_MODEL = OPENAI_MODELS.GPT_4O");
    expect(models).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(models).toContain("process.env.WIRELINE_OPENAI_STRUCTURED_MODEL");
  });

  it("self-configures a catalog-aware Stripe customer portal as the sole owner", () => {
    const registry = read("src/server/register-api-routes.ts");
    const portal = read("src/routes/billing-portal-readiness-routes.ts");
    const portalPolicy = read("src/lib/stripe-portal-policy.ts");
    const billingRoutes = read("src/routes/billing-routes.ts");

    expect(registry).toContain("app.use(billingPortalReadinessRouter)");
    expect(registry).toContain("app.use(launchBillingCheckoutRouter)");
    expect(registry).not.toContain("subscriptionCheckoutGuardRouter");
    expect(portal).toMatch(/router\.post\(\s*"\/api\/billing\/portal"/);
    expect(portal).toContain("stripe.billingPortal.configurations.create");
    expect(portal).toContain("stripe.billingPortal.sessions.create");
    expect(portalPolicy).toContain(
      "wireline-managed-customer-portal-${FOUNDER_CATALOG_VERSION}-${portalProductsFingerprint(products)}",
    );
    expect(portalPolicy).toContain("FOUNDER_CATALOG_VERSION");
    expect(portal).toContain("return_url: `${appUrl.url}/settings/billing`");
    expect(billingRoutes).not.toContain('router.post(\n  "/billing/portal"');
    expect(billingRoutes).not.toContain('router.post(\n  "/billing/checkout"');
  });

  it("cleans up browser microphone permission streams inside the protected session owner", () => {
    const hook = read("src/hooks/useProtectedPublicDemo.ts");
    const widget = read("src/components/marketing/BrowserCallWidget.tsx");

    expect(hook).toContain('fetch("/api/public/demo-session"');
    expect(hook).toContain("JSON.stringify({ agentName, source })");
    expect(hook).toContain("permissionStream.getTracks()");
    expect(hook).toContain("track.stop()");
    expect(hook).toContain("await instance.start(PROTECTED_DEMO_ASSISTANT_SENTINEL)");
    expect(widget).toContain("useProtectedPublicDemo");
    expect(widget).not.toContain("VITE_VAPI_PUBLIC_KEY");
    expect(widget).not.toContain("assistantPayload");
    expect(hook).not.toContain(
      'setError(reason instanceof Error ? reason.message : "Voice connection failed.")',
    );
  });
});
