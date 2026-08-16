import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_DIRECTION_MODES,
  AGENT_NUMBER_PROMISE,
  BRAND_SYSTEM,
  customerAgentLanguage,
  formatAgentRoleLabel,
  MARKETING_VOICE,
  OUTBOUND_WEDGE,
} from "../src/lib/product-copy";
import { STRIPE_PLANS } from "../src/lib/plan-catalog";
import { isSessionOptionalPublicPath } from "../src/lib/public-routes";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const withoutComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "");

const CORE_BUYING_SURFACES = [
  "src/lib/product-copy.ts",
  "src/pages/LandingPage.tsx",
  "src/pages/Pricing.tsx",
  "src/components/marketing/MarketingHero.tsx",
  "src/components/marketing/WireAgentLanding.tsx",
  "src/components/marketing/PrecisionPublicHeader.tsx",
  "src/components/marketing/MarketingStickyCta.tsx",
  "src/components/marketing/MarketingFooter.tsx",
] as const;

describe("product voice cohesion", () => {
  it("keeps one direct personal and business voice system", () => {
    expect(BRAND_SYSTEM.northStar).toBe(
      "Voice agents that call, answer, follow up, and finish the work.",
    );
    expect(BRAND_SYSTEM.productNoun).toBe("Voice agent");
    expect(BRAND_SYSTEM.buyingNoun).toBe("Voice Agent");
    expect(BRAND_SYSTEM.defaultRole).toBe("Your voice agent");
    expect(BRAND_SYSTEM.brandSpine).toEqual(["Build", "Train", "Launch"]);
    expect(BRAND_SYSTEM.proofLoop).toEqual(["Build", "Train", "Launch", "Improve"]);
    expect(BRAND_SYSTEM.toneRules).toContain("Lead with outcomes before AI mechanics.");
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Welcome both personal and business use without making either audience feel secondary.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Present calling, texting, and email as channels each trained voice agent can use, not separate products customers must assemble.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "State that the included Wireline number applies to paid plans so the free builder is never misrepresented.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Avoid em dashes, inflated AI language, and stacked claims on public buying surfaces.",
    );

    expect(MARKETING_VOICE.eyebrow).toBeNull();
    expect(MARKETING_VOICE.headline).toBe("Voice agents that get the work done");
    expect(MARKETING_VOICE.primaryCta).toBe("Build Your Voice Agent");
    expect(MARKETING_VOICE.subline).toBe(
      "Build one for your business or your life. It can call, answer, text, email, book, and follow through while you stay in control.",
    );
    expect(MARKETING_VOICE.channelProof).toEqual([
      "Calls and answers",
      "Text messages",
      "Email follow up",
      "Number on paid plans",
      "One inbox",
      "Shared memory",
    ]);
    expect(MARKETING_VOICE.spine).toEqual(BRAND_SYSTEM.brandSpine);
    expect(MARKETING_VOICE.proof).toEqual(BRAND_SYSTEM.proofLoop);
    expect(MARKETING_VOICE.buyingNoun).toBe(BRAND_SYSTEM.buyingNoun);
  });

  it("keeps public buying copy free of em dashes and retired all caps positioning", () => {
    for (const path of CORE_BUYING_SURFACES) {
      const source = read(path);
      expect(source, path).not.toContain("—");
      expect(source, path).not.toContain("AI VOICE AGENTS");
    }
  });

  it("keeps growth, service, and all purpose positioning concrete", () => {
    expect(OUTBOUND_WEDGE.headline).toBe("A voice agent that moves growth work forward");
    for (const verb of ["researches", "calls", "texts", "emails", "books", "logs proof"]) {
      expect(OUTBOUND_WEDGE.subline).toContain(verb);
    }
    expect(OUTBOUND_WEDGE.subline).toContain("specialists");
    expect(OUTBOUND_WEDGE.loop).toEqual(["Research", "Call", "Book", "Log"]);
    expect(AGENT_NUMBER_PROMISE).toContain("Every paid voice agent");
    expect(AGENT_NUMBER_PROMISE).toContain("includes a Wireline number");
    expect(AGENT_NUMBER_PROMISE).toContain("send texts");
    expect(AGENT_DIRECTION_MODES.inbound.loop).toEqual(["Answer", "Qualify", "Act", "Log"]);
    expect(AGENT_DIRECTION_MODES.inbound.promise).toContain("text or email");
    expect(AGENT_DIRECTION_MODES.hybrid.loop).toEqual(["Answer", "Sell", "Follow up", "Sync"]);
    expect(AGENT_DIRECTION_MODES.hybrid.promise).toContain("calls, texts, email");
  });

  it("uses contextual customer nouns without renaming the technical agent domain", () => {
    expect(customerAgentLanguage("personal")).toMatchObject({
      singular: "personal voice agent",
      plural: "personal voice agents",
      createCta: "Create personal voice agent",
      createCtaShort: "Create voice agent",
    });
    expect(customerAgentLanguage("business")).toMatchObject({
      singular: "business voice agent",
      plural: "business voice agents",
      createCta: "Create business voice agent",
      createCtaShort: "Create voice agent",
    });
    expect(formatAgentRoleLabel("ceo")).toBe("Lead Agent");

    const sources = [
      read("src/lib/product-copy.ts"),
      read("src/lib/agent-role-definitions.ts"),
      read("src/lib/agent-constants.ts"),
      read("src/components/ActivationChecklist.tsx"),
    ];
    expect(sources[1]).toContain('label: "Lead Agent"');
    expect(sources[1]).toContain('archetype: "All-Purpose Voice Agent"');
    expect(sources[3]).toContain("Ready for customers");

    for (const source of sources) {
      for (const phrase of ["AI employee", "best employee", "All-Purpose AI Employee"]) {
        expect(source).not.toContain(phrase);
      }
    }
  });

  it("keeps the canonical operating loop across public buying surfaces", () => {
    const features = read("src/pages/Features.tsx");
    const pricing = read("src/pages/Pricing.tsx");
    const authPortal = read("src/components/AuthPortal.tsx");
    expect(BRAND_SYSTEM.proofLoop).toEqual(["Build", "Train", "Launch", "Improve"]);
    expect(authPortal).toContain("customerAgentLanguage(workspaceMode)");
    expect(features).toContain("MARKETING_VOICE.proof");
    expect(features).not.toContain("Create → Train → Wire → Run");
    expect(features).not.toMatch(/\bemployees?\b/i);
    expect(features).toContain("Voice agents for every customer conversation");
    expect(pricing).not.toContain("create, train, wire, run");
    expect(pricing).not.toContain("Extra employees at");
    const starterPlus = STRIPE_PLANS.find((plan) => plan.id === "team");
    expect(starterPlus?.extra_agent_price_usd).toBe(15);
    expect(starterPlus?.extra_agent_voice_minutes_monthly).toBe(50);
  });

  it("keeps public landing copy broad, agent first, action oriented, and visibly navigable", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const executableLanding = withoutComments(landing);
    const about = read("src/pages/About.tsx");
    const compare = read("src/pages/Compare.tsx");
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    const contactAgents = read("src/data/contact-agents.ts");

    expect(read("src/pages/Features.tsx")).toContain("Text / SMS");
    expect(executableLanding).toContain('aria-label="Core agent channels"');
    expect(executableLanding).toContain('{ label: "Voice", icon: PhoneCall }');
    expect(executableLanding).toContain('{ label: "Text", icon: MessageSquareText }');
    expect(executableLanding).toContain('{ label: "Email", icon: Mail }');
    expect(executableLanding).not.toContain("Live Video");
    expect(executableLanding).toContain("MARKETING_VOICE.primaryCta");
    expect(executableLanding).toContain("MARKETING_VOICE.subline");
    expect(executableLanding).toContain("Hear It Live");
    expect(executableLanding).toContain('variant="stage"');
    expect(executableLanding).toContain("landing-console");
    expect(executableLanding).toContain("landing-console__activity");
    expect(executableLanding).toContain("Illustrative Workflow");
    expect(executableLanding).toContain("Booked and logged");
    expect(executableLanding).toContain("<PrecisionPublicHeader />");
    expect(executableLanding).not.toContain('variant="phone"');
    expect(executableLanding).not.toContain("landing-phone");
    expect(executableLanding).not.toContain("landing-os__tray");
    expect(executableLanding).not.toContain('chrome="hidden"');

    expect(about).toContain("Built by the people who answer the support email");
    expect(compare).toContain("Wireline vs. other voice AI");
    expect(privacy).toContain("voice agent platform");
    expect(contactAgents).toContain("Wireline specialists");

    const publicSources = [
      landing,
      read("src/components/marketing/TrustSignals.tsx"),
      read("src/components/marketing/MarketingFooter.tsx"),
      about,
      compare,
      privacy,
      contactAgents,
      read("src/components/PublicChangelog.tsx"),
      read("src/pages/PhoneSettings.tsx"),
      read("src/components/PhoneCallHistoryPanel.tsx"),
      read("chatgpt-app-submission.json"),
      read("ios/Wireline/Views/SignInView.swift"),
      read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt"),
      read("scripts/lib/stripe-founder-catalog.mjs"),
    ];
    for (const source of publicSources) {
      for (const phrase of [
        "AI employee",
        "trained employee",
        "multichannel employee",
        "Wireline employees",
        "Employee lines",
      ]) {
        expect(source).not.toContain(phrase);
      }
    }
  });

  it("keeps active launch docs agent first, inclusive, and on current pricing", () => {
    const campaign = read("docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md");
    const mediaKit = read("docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md");
    const launchGuru = read("docs/LAUNCH_GURU_PLAYBOOK_2026-07-20.md");
    const checklist = read("docs/WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md");

    for (const source of [campaign, mediaKit, launchGuru, checklist]) {
      expect(source).toContain("Voice Agents");
      expect(source).toContain("Build free. Go live from $19/mo");
      expect(source).not.toContain("Launch for $9");
      expect(source).not.toContain("from $9");
      expect(source).not.toContain("The best employee you've ever had");
    }

    expect(campaign).toContain("Voice agents for personal tasks and business conversations");
    expect(campaign).toContain("wl_launch_ai_voice_agents_v6");
    expect(campaign).toContain("AI Voice Generator Audio");
    expect(campaign).toContain("marketing/reference use only");
    expect(mediaKit).toContain("Legacy filenames containing");
    expect(launchGuru).toContain("Personal call delegation");
    expect(checklist).toContain(
      'Business workspace copy should use "business voice agent" when the audience is explicitly business',
    );
  });

  it("wires landing, workroom, and extension surfaces to shared voice constants", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const extension = read("apps/browser-extension/panel/index.html");
    expect(landing).toContain("MARKETING_VOICE.headline");
    expect(landing).toContain("MARKETING_VOICE.subline");
    expect(landing).toContain("MARKETING_VOICE.primaryCta");
    expect(landing).toContain("AGENT_DIRECTION_MODES");
    expect(landing).toContain("HERO_LOOP");
    expect(landing).toContain("MARKETING_VOICE.spine");
    expect(landing).not.toContain("HERO_LOOP = MARKETING_VOICE.proof");
    expect(workroom).toContain("WORKSPACE_VOICE");
    expect(extension).toContain(MARKETING_VOICE.extensionLead);
    expect(extension).toContain('data-action="call"');
    expect(extension).toContain('data-action="text"');
    expect(extension).toContain(">Email</button>");
  });

  it("keeps landing examples broad across profit, inbound, and hybrid buyers", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    for (const phrase of [
      "Lead Response",
      "Quote Follow Up",
      "Appointment Setting",
      "Front Desk",
      "Lead Qualifier",
      "Support Triage",
      "Sales Desk",
      "Collections Desk",
      "Appointment Desk",
      "AGENT_DIRECTION_MODES",
    ]) {
      expect(landing).toContain(phrase);
    }
    expect(landing).not.toContain("service estimate");
    expect(landing).not.toContain("Start booking them");
    expect(landing).not.toContain("Wireline CEO");
  });

  it("keeps included number capacity aligned to included agents", () => {
    const publicCapacityPlans = STRIPE_PLANS.filter(
      (plan) => plan.id !== "enterprise" && plan.id !== "personal",
    );
    for (const plan of publicCapacityPlans) {
      expect(plan.included_phone_numbers, plan.id).toBe(plan.max_agents);
    }

    const catalog = read("src/lib/plan-catalog.ts");
    const billing = read("src/pages/BillingSettings.tsx");
    const verification = read("src/components/layout/EmailVerifyBanner.tsx");
    expect(catalog).toContain(
      "Every paid tier guarantees live voice capacity and an on-demand number slot",
    );
    expect(catalog).toContain("Paid extra-agent add-ons increase both agent count");
    expect(billing).toContain("plan.included_phone_numbers");
    expect(verification).toContain("A live");
    expect(verification).toContain("plan and compliant number");
    expect(verification).not.toContain("14 days");
    expect(verification).not.toContain("25 outbound calls");
  });

  it("keeps provisioning wired to catalog-backed line slots", () => {
    const entitlements = read("src/lib/phone-line-entitlements.ts");
    const provisioning = read("src/lib/phone-provisioning.ts");
    expect(entitlements).toContain("includedPhoneSlotsForPlan");
    expect(entitlements).toContain("extra_agent_included_phone_numbers");
    expect(provisioning).toContain("existing >= phoneSlots");
    expect(provisioning).toContain("includedPhoneSlotsForPlan");
    expect(provisioning).toContain("findAgentPhoneLine(userId, opts.agentId)");
    expect(provisioning).toContain("purchaseTwilioLocalNumber");
    expect(provisioning).toContain("importTwilioNumberToVapi");
    expect(provisioning).toContain("provisionVapiNumber");
  });

  it("keeps public entry paths broad instead of defaulting to home services", () => {
    const app = read("src/App.tsx");
    const precisionHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
    expect(existsSync("src/components/marketing/PublicSiteHeader.tsx")).toBe(false);
    const footer = read("src/components/marketing/MarketingFooter.tsx");
    expect(app).toContain('path="/for/*" element={<Navigate to="/for/personal" replace />}');
    expect(precisionHeader).toContain('to: "/solutions/support"');
    expect(precisionHeader).toContain('path.startsWith("/for/")');
    expect(footer).toContain('to: "/for/personal", label: "Personal"');
    for (const wedgePath of [
      "/for/home-services",
      "/for/insurance",
      "/for/legal",
      "/for/medical",
      "/for/real-estate",
      "/for/restaurants",
      "/for/sales",
    ]) {
      expect(footer, wedgePath).toContain(`to: "${wedgePath}"`);
    }
    expect(footer.indexOf('to: "/for/personal"')).toBeLessThan(
      footer.indexOf('to: "/for/home-services"'),
    );

    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const sticky = read("src/components/marketing/MarketingStickyCta.tsx");
    expect(precisionHeader.match(/to="\/signup\?plan=personal"/g)).toHaveLength(2);
    expect(landing).toContain('"/signup?plan=personal"');
    expect(sticky).toContain('href = "/signup?plan=personal"');
    expect(landing).not.toContain('to: "/signup"');
    expect(landing).not.toContain('to="/signup"');
  });

  it("keeps every public top-level surface session optional", () => {
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
    expect(existsSync("src/components/PhoneAgentBlueprint.tsx")).toBe(false);
    const wireForm = read("src/components/recipes/forms/AgentWireForm.tsx");
    const documentForm = read("src/components/recipes/forms/KnowledgeFromDocumentForm.tsx");
    const urlForm = read("src/components/recipes/forms/KnowledgeFromUrlForm.tsx");
    const chatgptSubmission = read("docs/CHATGPT_APP_SUBMISSION.md");
    const customizationArchitecture = read("docs/AGENT_CUSTOMIZATION_ARCHITECTURE.md");
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

  it("keeps the authenticated route map intentional", () => {
    const routes = read("src/routes/AppRoutes.tsx");
    for (const path of [
      "/overview",
      "/studio",
      "/templates",
      "/knowledge",
      "/connections",
      "/call-logs",
      "/logs",
      "/phone",
      "/inbox",
      "/apps",
      "/settings",
      "/admin",
      "/connections/salesforce",
    ]) {
      expect(routes).toContain(`path="${path}"`);
    }
    expect(routes).toContain('to="/phone?tab=logs"');
    expect(routes).toContain("AuthNotFound");
    expect(routes).toContain("RouteFallback");
    for (const retiredPath of [
      "/actions",
      "/actions/salesforce",
      "/dashboard",
      "/pulse",
      "/fleet",
      "/ops",
      "/training",
      "/chat",
      "/nexus",
      "/wires",
    ]) {
      expect(routes).not.toContain(`path="${retiredPath}"`);
    }
  });

  it("keeps top-level workspace pages mounted to current surfaces", () => {
    const customization = read("src/pages/CustomizationSettings.tsx");
    const authenticatedVisualQa = read("scripts/capture-prod-visual-qa.mjs");
    expect(read("src/pages/TemplatesPage.tsx")).toContain("AgentTemplates");
    expect(read("src/pages/AgentStudioHome.tsx")).toContain("CreateAgentDialog");
    expect(read("src/pages/OverviewPage.tsx")).toContain("Customer demand and outcomes");
    expect(read("src/pages/OverviewPage.tsx")).toContain("Recent customer conversations");
    expect(read("src/components/outbound/OutboundHub.tsx")).toContain("CampaignsPanel");
    expect(read("src/components/outbound/OutboundHub.tsx")).toContain("IntakeKeysManager");
    expect(customization).toContain('href: "/knowledge"');
    expect(customization).toContain("WorkspaceBrandingSettings");
    expect(customization).not.toContain('href: "/training');
    expect(customization).not.toContain('href: "/settings/apps"');
    expect(authenticatedVisualQa).toContain("`${baseUrl}/knowledge`");
    expect(authenticatedVisualQa).not.toContain("`${baseUrl}/training`");
  });

  it("keeps authenticated surfaces action first", () => {
    const docs = read("docs/README.md");
    expect(docs).toContain("Public pages explain. Authenticated pages execute.");
    expect(docs).toContain("Use labels, tabs, icons, state, and clear next actions");
    expect(docs).toContain(
      "Phone / Call History and Analytics may explain history, coaching, exports, and insights",
    );

    const calls = read("src/components/CallLogsClaude.tsx");
    expect(calls).toContain("Analytics");
    expect(calls).toContain("coaching_note");
    expect(calls).toContain("qa_score");
    expect(calls).toContain("lead_score");
  });
});
