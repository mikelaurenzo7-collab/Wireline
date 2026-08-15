import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness sextuple-pass 2026-07-27", () => {
  it("pins Runtime Balance in billing continuity grace copy", () => {
    const grace = read("src/lib/voice-completion-grace.ts");
    const continuity = read("tests/live-call-billing-continuity-contract.test.ts");
    expect(grace).toContain("temporary negative Runtime Balance");
    expect(continuity).toContain("temporary negative Runtime Balance");
    expect(continuity).not.toContain("temporary negative Conversation Balance");
  });

  it("gates every public monthly and annual price from the canonical catalog", () => {
    const script = read("scripts/generate-launch-status.mjs");
    const manifest = read("scripts/lib/stripe-founder-catalog.mjs");
    expect(manifest).toContain('PUBLIC_SELF_SERVE_PLAN_IDS = ["starter", "team", "business"]');
    expect(script).toContain("FOUNDER_PRICES");
    expect(script).toContain("FOUNDER_CATALOG_VERSION");
    expect(script).toContain("PUBLIC_SELF_SERVE_PLAN_IDS");
    expect(script).toContain(
      "publicCatalogPrices.length === PUBLIC_SELF_SERVE_PLAN_IDS.length * 2",
    );
    expect(script).toContain("actual.metadata?.wireline_catalog_version");
    expect(script).toContain("actual.metadata?.wireline_price_key");
    expect(script).toContain('catalogParams.append("expand[]", "data.product")');
    expect(script).toContain("product_name_mismatch");
    expect(script).toContain("product_catalog_version_mismatch");
    expect(script).toContain("supportEmail === STRIPE_PUBLIC_SUPPORT_EMAIL");
    expect(script).toContain("brandingLogo.length > 0");
    expect(script).toContain("brandingPrimaryColor === STRIPE_BRAND_PRIMARY_COLOR");
    expect(script).toContain("brandingSecondaryColor === STRIPE_BRAND_SECONDARY_COLOR");
    expect(script).toContain("managed_configuration_missing");
    expect(script).toContain("plan_switch_prices_mismatch");
    expect(script).toContain('subscription_cancel?.mode === "at_period_end"');
    expect(script).toContain("catalog_version_mismatch");
    expect(script).toContain("price_key_mismatch");
    expect(script).toContain("stripe_public_catalog_not_aligned");
    expect(script).not.toContain("starter_annual_price_not_live_99");
  });

  it("keeps Knowledge upload honesty aligned with the text/image asset API", () => {
    const kb = read("src/components/KnowledgeBaseClaude.tsx");
    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("Upload a text document or a PNG, JPG, WEBP, or GIF image.");
    expect(kb).toContain(
      'accept=".txt,.csv,.md,.markdown,image/png,image/jpeg,image/jpg,image/webp,image/gif"',
    );
    expect(kb).toContain("TXT, MD, CSV, or images (PNG, JPG, WEBP, GIF)");
    expect(kb).not.toContain("PDF, DOCX, TXT, CSV");
    expect(kb).toContain("is not supported yet");
    expect(kb).toContain("Knowledge could not be loaded.");
  });

  it("never marks ComplianceChecklist integrations done on a failed health fetch", () => {
    const checklist = read("src/components/admin/ComplianceChecklist.tsx");
    expect(checklist).toContain("intRes != null &&");
    expect(checklist).toContain("dncRes != null && dncLen > 0");
  });

  it("keeps public Trust and tenant Compliance free of vendor/env operator copy", () => {
    const security = read("src/components/Security.tsx");
    const compliance = read("src/components/ComplianceCenter.tsx");
    expect(security).toMatch(
      /Marketing and campaign outbound[^.]*fail closed[^.]*stay blocked[^.]*federal DNC setup/i,
    );
    expect(security).not.toContain("DNCScrub");
    expect(security).not.toContain("FEDERAL_DNC_API_KEY");
    expect(compliance).toContain("Marketing outbound blocked");
    expect(compliance).not.toContain("DNCScrub");
  });

  it("aligns Blog, Pricing, Messaging playbook, and AI error copy with launch voice", () => {
    const blog = read("src/pages/Blog.tsx");
    const pricing = read("src/pages/Pricing.tsx");
    const playbooks = read("src/lib/integration-playbooks.ts");
    const aiErrors = read("src/lib/ai-stream-errors.ts");
    const browser = read("src/pages/BrowserCommandInstallPage.tsx");
    expect(blog).toContain("Voice agent");
    expect(blog).not.toContain("AI call agent");
    expect(pricing).toContain("Five specialized agents. One supervised workspace.");
    expect(pricing).not.toContain('publicName: "Business"');
    expect(pricing).not.toContain("AI conversation workforce");
    expect(playbooks).toContain("WhatsApp in private beta");
    expect(aiErrors).toContain("OpenAI, Gemini, or AI Gateway");
    expect(aiErrors).not.toContain("xAI, OpenAI");
    expect(browser).not.toContain("dogfood");
  });

  it("keeps validation/API errors inline but opens email fallback for transport and 5xx failures", () => {
    const contact = read("src/components/ContactPage.tsx");
    const support = read("src/components/SupportPage.tsx");
    for (const source of [contact, support]) {
      expect(source).toContain("responseStatus = response.status");
      expect(source).toContain("responseStatus !== null && responseStatus >= 500");
      expect(source).toContain("mailto:support@trywireline.com");
      expect(source).toContain("setError(message)");
    }
    expect(contact).toContain("Only fall back to mailto for transport/service failures");
    expect(contact).toContain("isTransport");
    expect(support).toContain("isTransport");
  });

  it("retunes home hero CSS for AI VOICE AGENTS and surfaces team fetch failures", () => {
    const css = read("src/styles/public-marketing-polish.css");
    const admin = read("src/components/AdminSettings.tsx");
    expect(css).toContain('keep "AI VOICE AGENTS"');
    expect(css).toContain("max-width: min(100%, 16ch)");
    expect(admin).toContain('toastError("Team unavailable"');
  });
});
