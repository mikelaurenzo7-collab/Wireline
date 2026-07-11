import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_DIRECTION_MODES,
  AGENT_NUMBER_PROMISE,
  BRAND_SYSTEM,
  EMPLOYEE_CHANNELS,
  MARKETING_VOICE,
  ONE_EMPLOYEE_CHANNEL_PROMISE,
  OUTBOUND_WEDGE,
} from "../src/lib/product-copy";
import { STRIPE_PLANS } from "../src/lib/plan-catalog";
import { isSessionOptionalPublicPath } from "../src/lib/public-routes";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product voice cohesion", () => {
  it("keeps the AI employee and multichannel promise in one shared module", () => {
    expect(BRAND_SYSTEM.northStar).toBe(
      "The best employee you've ever had, for next to nothing.",
    );
    expect(BRAND_SYSTEM.productNoun).toBe("AI employee");
    expect(BRAND_SYSTEM.defaultRole).toBe("Your best employee");
    expect(BRAND_SYSTEM.brandSpine).toEqual(["Wire", "Work", "Win"]);
    expect(BRAND_SYSTEM.proofLoop).toEqual(["Brief", "Train", "Launch", "Improve"]);
    expect(BRAND_SYSTEM.toneRules).toContain("Lead with business outcomes before AI mechanics.");
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Make the default feel like the owner's best employee, not another executive title.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Present voice, email, and text/SMS as capabilities of one employee, not three required employees.",
    );

    expect(EMPLOYEE_CHANNELS).toEqual(["Voice", "Email", "Text / SMS"]);
    expect(ONE_EMPLOYEE_CHANNEL_PROMISE).toContain("One AI employee");
    expect(ONE_EMPLOYEE_CHANNEL_PROMISE).toContain("voice, email, and text/SMS");
    expect(ONE_EMPLOYEE_CHANNEL_PROMISE).toContain("same business knowledge");
    expect(ONE_EMPLOYEE_CHANNEL_PROMISE).toContain("rules, approvals, memory");

    expect(MARKETING_VOICE.eyebrow).toBeNull();
    expect(MARKETING_VOICE.headline).toBe("Wire → Work → Win");
    expect(MARKETING_VOICE.subline).toBe(
      "One AI employee for voice, email, and text/SMS conversations.",
    );
    expect(MARKETING_VOICE.channelHeadline).toBe(
      "Voice agent. Email agent. Text/SMS agent. One AI employee.",
    );
    expect(MARKETING_VOICE.channelPromise).toBe(ONE_EMPLOYEE_CHANNEL_PROMISE);
    expect(MARKETING_VOICE.channels).toEqual(EMPLOYEE_CHANNELS);
    expect(MARKETING_VOICE.spine).toEqual(BRAND_SYSTEM.brandSpine);
    expect(MARKETING_VOICE.proof).toEqual(["Brief", "Train", "Launch", "Improve"]);

    expect(OUTBOUND_WEDGE.headline).toBe("Your best employee for growth work.");
    expect(OUTBOUND_WEDGE.subline).toContain("one all-in-one AI employee");
    expect(OUTBOUND_WEDGE.subline).toContain("calls");
    expect(OUTBOUND_WEDGE.subline).toContain("emails");
    expect(OUTBOUND_WEDGE.subline).toContain("texts");
    expect(OUTBOUND_WEDGE.subline).toContain("researches");
    expect(OUTBOUND_WEDGE.subline).toContain("sells");
    expect(OUTBOUND_WEDGE.subline).toContain("markets");
    expect(OUTBOUND_WEDGE.subline).toContain("logs proof");
    expect(OUTBOUND_WEDGE.loop).toEqual(["Research", "Reach", "Book", "Log"]);
    expect(AGENT_NUMBER_PROMISE).toContain("Every included AI employee");
    expect(AGENT_NUMBER_PROMISE).toContain("included Wireline number");
    expect(AGENT_NUMBER_PROMISE).toContain("same employee");
    expect(AGENT_DIRECTION_MODES.inbound.loop).toEqual(["Answer", "Qualify", "Act", "Log"]);
    expect(AGENT_DIRECTION_MODES.hybrid.loop).toEqual(["Answer", "Sell", "Follow up", "Sync"]);
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
    expect(pricing).not.toContain("create, train, wire, run");
    expect(pricing).not.toContain("Extra employees at");
    const starterPlus = STRIPE_PLANS.find((plan) => plan.id === "team");
    expect(starterPlus?.extra_agent_price_usd).toBe(15);
    expect(starterPlus?.extra_agent_voice_minutes_monthly).toBe(50);
  });

  it("wires landing and workroom surfaces to shared voice constants", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const extension = read("apps/browser-extension/panel/index.html");
    expect(landing).toContain("MARKETING_VOICE.headline");
    expect(landing).toContain("MARKETING_VOICE.subline");
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
    expect(landing).toContain("Sales desk");
    expect(landing).toContain("Collections desk");
    expect(landing).toContain("Appointment desk");
    expect(landing).toContain("AGENT_DIRECTION_MODES");
    expect(landing).not.toContain("service estimate");
    expect(landing).not.toContain("Start booking them");
    expect(landing).not.toContain("Wireline CEO");
  });

  it("keeps the free-number promise backed by included capacity", () => {
    const catalog = read("src/lib/plan-catalog.ts");
    const billing = read("src/pages/BillingSettings.tsx");
    expect(catalog).toContain(
      "Every paid tier guarantees live voice capacity and an on-demand number slot",
    );
    expect(catalog).toContain("Paid extra-agent add-ons increase both agent count");
    expect(catalog).toContain("max_agents: 1");
    expect(catalog).toContain("included_phone_numbers: 1");
    expect(catalog).toContain("max_agents: 5");
    expect(catalog).toContain("included_phone_numbers: 5");
    expect(billing).toContain("plan.included_phone_numbers");
  });

  it("keeps included number capacity mathematically aligned to included agents", () => {
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
      "/", "/features", "/pricing", "/compare", "/about", "/support", "/contact",
      "/showcase", "/developers", "/blog", "/blog/founder-note", "/status",
      "/changelog", "/security", "/trust", "/trust/medical", "/privacy", "/terms",
      "/for/personal", "/solutions/call-centers", "/signin", "/signup", "/get-started",
      "/reset-password", "/oauth-complete", "/auth/oauth-complete",
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
    for (const expected of [
      'path="/overview"', 'path="/studio"', 'path="/templates"', 'path="/knowledge"',
      'path="/connections"', 'path="/call-logs"', 'path="/logs"', 'to="/phone?tab=logs"',
      'path="/phone"', 'path="/inbox"', 'path="/apps"', 'path="/settings"',
      'path="/admin"', 'path="/connections/salesforce"', "AuthNotFound", "RouteFallback",
    ]) {
      expect(routes).toContain(expected);
    }
    for (const retired of [
      'path="/actions"', 'path="/actions/salesforce"', 'path="/dashboard"', 'path="/pulse"',
      'path="/fleet"', 'path="/ops"', 'path="/training"', 'path="/chat"',
      'path="/nexus"', 'path="/wires"',
    ]) {
      expect(routes).not.toContain(retired);
    }
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
