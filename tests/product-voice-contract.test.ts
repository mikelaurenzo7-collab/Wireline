import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_DIRECTION_MODES,
  MARKETING_VOICE,
  OUTBOUND_WEDGE,
  PROFIT_AGENT_NUMBER_PROMISE,
} from "../src/lib/product-copy";
import { STRIPE_PLANS } from "../src/lib/plan-catalog";
import { isSessionOptionalPublicPath } from "../src/lib/public-routes";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product voice cohesion", () => {
  it("keeps marketing hero strings and call direction modes in one shared module", () => {
    expect(MARKETING_VOICE.headline).toBe("AI profit agents that actually call.");
    expect(MARKETING_VOICE.subline).toContain("Book more appointments");
    expect(MARKETING_VOICE.subline).toContain("revive stale leads");
    expect(MARKETING_VOICE.subline).toContain("included number for every included agent");
    expect(MARKETING_VOICE.proof).toEqual(["Build", "Train", "Launch", "Profit"]);

    expect(OUTBOUND_WEDGE.headline).toBe("AI profit agents that actually call.");
    expect(OUTBOUND_WEDGE.subline).toContain("book appointments");
    expect(OUTBOUND_WEDGE.subline).toContain("promote offers");
    expect(OUTBOUND_WEDGE.subline).toContain("without commission");
    expect(OUTBOUND_WEDGE.loop).toEqual(["List", "Pitch", "Call", "Profit"]);
    expect(PROFIT_AGENT_NUMBER_PROMISE).toContain("Every included Wireline agent");
    expect(PROFIT_AGENT_NUMBER_PROMISE).toContain("included number");
    expect(AGENT_DIRECTION_MODES.inbound.loop).toEqual(["Answer", "Qualify", "Book", "Log"]);
    expect(AGENT_DIRECTION_MODES.hybrid.loop).toEqual(["Answer", "Act", "Follow up", "Sync"]);
  });

  it("keeps the canonical operating loop across public buying surfaces", () => {
    const features = read("src/pages/Features.tsx");
    const pricing = read("src/pages/Pricing.tsx");
    const authPortal = read("src/components/AuthPortal.tsx");

    for (const surface of [features, authPortal]) {
      expect(surface).toContain("Build");
      expect(surface).toContain("Train");
      expect(surface).toContain("Launch");
      expect(surface).toContain("Improve");
    }

    expect(features).toContain("Build → Train → Launch → Improve");
    expect(features).not.toContain("Create → Train → Wire → Run");
    // Pricing no longer walks the operating loop by name (it leads with tier
    // cards and channel economics instead) but must never revert to the
    // retired phrasing, and per-agent add-on pricing is formally retired
    // (plansForClient() always returns extra_agent_price_usd: null now).
    expect(pricing).not.toContain("create, train, wire, run");
    expect(pricing).not.toContain("Extra employees at");
  });

  it("wires landing and workroom surfaces to shared voice constants", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const extension = read("apps/browser-extension/panel/index.html");
    expect(landing).toContain("AGENT_DIRECTION_MODES");
    expect(landing).toContain("HERO_LOOP");
    expect(workroom).toContain("WORKSPACE_VOICE");
    expect(extension).toContain(MARKETING_VOICE.extensionLead);
  });

  it("keeps public landing examples broad across profit, inbound, and hybrid buyers", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("Lead response");
    expect(landing).toContain("Quote follow-up");
    expect(landing).toContain("Appointment setting");
    expect(landing).toContain("Front desk");
    expect(landing).toContain("Lead qualifier");
    expect(landing).toContain("Support triage");
    expect(landing).toContain("Revenue desk");
    expect(landing).toContain("Collections desk");
    expect(landing).toContain("Appointment desk");
    expect(landing).toContain("AGENT_DIRECTION_MODES");
    expect(landing).not.toContain("service estimate");
    expect(landing).not.toContain("Start booking them");
  });

  it("keeps the free-number promise backed by included capacity", () => {
    const catalog = read("src/lib/plan-catalog.ts");
    const billing = read("src/pages/BillingSettings.tsx");
    expect(catalog).toContain(
      "Every paid tier guarantees live voice capacity and an on-demand number slot",
    );
    expect(catalog).toContain("max_agents: 1");
    expect(catalog).toContain("included_phone_numbers: 1");
    expect(catalog).toContain("max_agents: 5");
    expect(catalog).toContain("included_phone_numbers: 5");
    expect(billing).toContain("plan.included_phone_numbers");
  });

  it("keeps included number capacity mathematically aligned to included agents", () => {
    // Personal (Free Builder) is pre-activation by design: no production number
    // until the Account Holder pays. Every paid tier still guarantees one
    // included number per included agent.
    const publicCapacityPlans = STRIPE_PLANS.filter(
      (plan) => plan.id !== "enterprise" && plan.id !== "personal",
    );

    for (const plan of publicCapacityPlans) {
      expect(plan.included_phone_numbers, plan.id).toBe(plan.max_agents);
    }
  });

  it("keeps provisioning and entitlement code wired to catalog-backed line slots", () => {
    const entitlements = read("src/lib/phone-line-entitlements.ts");
    const provisioning = read("src/lib/phone-provisioning.ts");

    expect(entitlements).toContain("return tier.included_phone_numbers");
    expect(provisioning).toContain("existing >= plan.included_phone_numbers");
    expect(provisioning).toContain("findAgentPhoneLine(userId, opts.agentId)");
    expect(provisioning).toContain("purchaseTwilioLocalNumber");
    expect(provisioning).toContain("importTwilioNumberToVapi");
    expect(provisioning).toContain("provisionVapiNumber");
  });

  it("keeps public entry paths broad instead of defaulting to home services", () => {
    const app = read("src/App.tsx");
    const precisionHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
    const publicHeader = read("src/components/marketing/PublicSiteHeader.tsx");
    const footer = read("src/components/marketing/MarketingFooter.tsx");

    expect(app).toContain('path="/for/*" element={<Navigate to="/for/personal" replace />}');
    expect(precisionHeader).toContain('to: "/solutions/support"');
    expect(precisionHeader).toContain('path.startsWith("/for/")');
    expect(publicHeader).toContain('to: "/for/personal", label: "Use cases"');
    expect(footer).toContain('to: "/for/personal", label: "Personal"');
    expect(publicHeader).not.toContain('label: "Home services"');
    expect(footer).not.toContain('label: "Home services"');
  });

  it("keeps every public top-level surface session-optional", () => {
    const publicPaths = [
      "/",
      "/features",
      "/pricing",
      "/compare",
      "/about",
      "/support",
      "/contact",
      "/showcase",
      "/developers",
      "/blog",
      "/blog/founder-note",
      "/status",
      "/changelog",
      "/security",
      "/trust",
      "/trust/medical",
      "/privacy",
      "/terms",
      "/for/personal",
      "/solutions/call-centers",
      "/signin",
      "/signup",
      "/get-started",
      "/reset-password",
      "/oauth-complete",
      "/auth/oauth-complete",
    ];

    for (const path of publicPaths) {
      expect(isSessionOptionalPublicPath(path), path).toBe(true);
    }
  });

  it("keeps authenticated setup examples broad across support and call coverage", () => {
    const blueprint = read("src/components/PhoneAgentBlueprint.tsx");
    const wireForm = read("src/components/recipes/forms/AgentWireForm.tsx");
    const documentForm = read("src/components/recipes/forms/KnowledgeFromDocumentForm.tsx");
    const urlForm = read("src/components/recipes/forms/KnowledgeFromUrlForm.tsx");
    const chatgptSubmission = read("docs/CHATGPT_APP_SUBMISSION.md");
    const customizationArchitecture = read("docs/AGENT_CUSTOMIZATION_ARCHITECTURE.md");

    expect(blueprint).toContain('label: "Support desk"');
    expect(blueprint).toContain('label: "Call center / overflow"');
    expect(blueprint.indexOf('label: "Sales and qualification"')).toBeLessThan(
      blueprint.indexOf('label: "Home services"'),
    );
    expect(blueprint).toContain('aria-label="Use case"');
    expect(wireForm).toContain(
      "Call warm leads, qualify interest, book the next step, and log the outcome.",
    );
    expect(wireForm).toContain('label="Use case"');
    expect(documentForm).toContain("Sales and support agent");
    expect(urlForm).toContain("answers FAQs, routes requests");
    expect(chatgptSubmission).toContain("personal call delegation, sales, support, scheduling");
    expect(chatgptSubmission).toContain("sales and support phone agent");
    expect(customizationArchitecture).toContain("front-desk and sales support agent");
    expect(wireForm).not.toContain("Acme HVAC");
    expect(wireForm).not.toContain('placeholder="Home services"');
    expect(documentForm).not.toContain("HVAC service company");
    expect(urlForm).not.toContain("HVAC service company");
    expect(customizationArchitecture).not.toContain("calm HVAC receptionist");
  });

  it("keeps authenticated page map intentional", () => {
    const routes = read("src/routes/AppRoutes.tsx");
    expect(routes).toContain('path="/overview"');
    expect(routes).toContain('path="/studio"');
    expect(routes).toContain('path="/templates"');
    expect(routes).toContain('path="/knowledge"');
    expect(routes).toContain('path="/connections"');
    expect(routes).toContain('path="/call-logs"');
    expect(routes).toContain('path="/logs"');
    expect(routes).toContain('to="/phone?tab=logs"');
    expect(routes).toContain('path="/phone"');
    expect(routes).toContain("AuthNotFound");
    expect(routes).toContain('path="/inbox"');
    expect(routes).toContain('path="/apps"');
    expect(routes).toContain('path="/settings"');
    expect(routes).toContain('path="/admin"');
    expect(routes).toContain("RouteFallback");
    expect(routes).toContain('path="/connections/salesforce"');
    expect(routes).not.toContain('path="/actions"');
    expect(routes).not.toContain('path="/actions/salesforce"');
    expect(routes).not.toContain('path="/dashboard"');
    expect(routes).not.toContain('path="/pulse"');
    expect(routes).not.toContain('path="/fleet"');
    expect(routes).not.toContain('path="/ops"');
    expect(routes).not.toContain('path="/training"');
    expect(routes).not.toContain('path="/chat"');
    expect(routes).not.toContain('path="/nexus"');
    expect(routes).not.toContain('path="/wires"');
  });

  it("keeps top-level workspace pages mounted to the current surfaces", () => {
    expect(read("src/pages/TemplatesPage.tsx")).toContain("AgentTemplates");
    expect(read("src/pages/AgentStudioHomeClaude.tsx")).toContain("CreateAgentDialog");
    expect(read("src/pages/OverviewPage.tsx")).toContain("Workspace metrics");
    expect(read("src/pages/OverviewPage.tsx")).toContain("Recent calls");
    expect(read("src/components/outbound/OutboundHub.tsx")).toContain("CampaignsPanel");
    expect(read("src/components/outbound/OutboundHub.tsx")).toContain("IntakeKeysManager");
  });

  it("keeps authenticated surfaces action-first, not explanatory", () => {
    const docs = read("docs/README.md");
    expect(docs).toContain("Public pages explain. Authenticated pages execute.");
    expect(docs).toContain("Use labels, tabs, icons, state, and clear next actions");
    expect(docs).toContain(
      "Phone / Call History and Analytics may explain history, coaching, exports, and insights",
    );
  });

  it("preserves call history as the allowed explanatory analytics surface", () => {
    const calls = read("src/components/CallLogsClaude.tsx");
    expect(calls).toContain("Analytics");
    expect(calls).toContain("coaching_note");
    expect(calls).toContain("qa_score");
    expect(calls).toContain("lead_score");
  });
});
