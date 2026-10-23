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
  PRODUCT_POSTURE,
  WORKSPACE_VOICE,
} from "../src/lib/product-copy";
import {
  BOT_BRAND,
  BOT_CHANNELS,
  BOT_MARKETING_VOICE,
  BOT_PRODUCT_TYPES,
  BOT_ROLE_TEMPLATES,
} from "../src/lib/bot-product";
import { isReviewedOutboundCandidate } from "../src/lib/outbound-call-purpose";
import { STRIPE_PLANS } from "../src/lib/plan-catalog";
import { isSessionOptionalPublicPath } from "../src/lib/public-routes";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const withoutComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "");

const CORE_BUYING_SURFACES = [
  "src/lib/product-copy.ts",
  "src/lib/bot-product.ts",
  "src/pages/LandingPage.tsx",
  "src/pages/Pricing.tsx",
  "src/components/marketing/WireAgentLanding.tsx",
  "src/components/marketing/PrecisionPublicHeader.tsx",
  "src/components/marketing/MarketingStickyCta.tsx",
  "src/components/marketing/MarketingFooter.tsx",
] as const;

const CUSTOMER_BOT_SURFACES = [
  "src/components/ActivationChecklist.tsx",
  "src/components/AgentTemplates.tsx",
  "src/components/CrmConnectionCard.tsx",
  "src/components/OutboundDialDialog.tsx",
  "src/components/PublicChangelog.tsx",
  "src/components/StripeBillingCard.tsx",
  "src/components/StudioWorkroom.tsx",
  "src/components/DeployAgentModal.tsx",
  "src/components/EmailInbox.tsx",
  "src/components/SmsThreads.tsx",
  "src/components/SupportPage.tsx",
  "src/components/OpenAILiveVoiceSandbox.tsx",
  "src/components/admin/CarrierPanel.tsx",
  "src/components/insights/shared.tsx",
  "src/components/onboarding/PostCreateActivationWizard.tsx",
  "src/components/outbound/CampaignsPanel.tsx",
  "src/lib/private-agent-test.ts",
  "src/pages/CustomizationSettings.tsx",
  "src/pages/Showcase.tsx",
  "src/routes/marketing-runtime-routes.ts",
  "src/routes/agent-test-routes.ts",
  "src/routes/chatgpt-mcp-account-routes.ts",
] as const;

const UNIFIED_AUDIENCE_SURFACES = [
  "src/components/admin/AccountsPanel.tsx",
  "src/components/CommandBar.tsx",
  "src/components/CreateAgentDialog.tsx",
  "src/components/StudioAgentWorkspacePanel.tsx",
  "src/components/bots/BotConfigurator.tsx",
  "src/components/overview/FirstRunWorkspace.tsx",
  "src/pages/OverviewPage.tsx",
  "src/pages/KnowledgePage.tsx",
  "src/components/ContactPage.tsx",
  "src/routes/chatgpt-mcp-account-routes.ts",
  "ios/Wireline/Views/AssistantLibraryView.swift",
  "ios/Wireline/Views/WorkspaceView.swift",
  "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
] as const;

describe("BotBound product voice", () => {
  it("uses BotBound + Bot customer language while retaining agent as the technical domain", () => {
    expect(BOT_BRAND).toMatchObject({
      name: "BotBound",
      slogan: "For You. For Your Business.",
      supportingLine: "CALL · EMAIL · COMPUTER",
      promise: "Your Bot for incoming calls, reviewed calls, email, and computer tasks.",
    });
    expect(BRAND_SYSTEM).toMatchObject({
      northStar: BOT_BRAND.promise,
      slogan: BOT_BRAND.slogan,
      supportingLine: BOT_BRAND.supportingLine,
      productNoun: "Bot",
      buyingNoun: "Bot",
      defaultRole: "Your Bot",
      productTypes: BOT_PRODUCT_TYPES,
    });
    expect(BRAND_SYSTEM).not.toHaveProperty("brandSpine");
    expect(BRAND_SYSTEM).not.toHaveProperty("proofLoop");
    expect(MARKETING_VOICE).not.toHaveProperty("spine");
    expect(MARKETING_VOICE).not.toHaveProperty("proof");
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Public marketing leads with capabilities, outcomes, and a clear signup action. Do not add a public setup sequence or repeat process slogans. Keep operational setup guidance inside the product.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Render the BotBound brand name in canonical mixed case everywhere it is customer-visible, including prose, metadata, and legal copy.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Keep technical wireline identifiers, URLs, domains, email addresses, API names, event keys, and persisted values in their native casing.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Never use Wire as a customer-facing setup step, nav label, or CTA. Keep changing the Bot and trying it privately together in the Workspace's Set Up before Launch.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Do not stack BotBound with Phone Bot or Voice Bot as a compound noun. The brand already contains Bot. Say BotBound, or say Phone Bot, not both.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Author every product title and heading in Title Case, including heroes, page titles, section titles, cards, dialogs, and empty-state titles. Never uppercase headings with CSS.",
    );
  });

  it("keeps operational customer surfaces on Bot terminology", () => {
    for (const path of CUSTOMER_BOT_SURFACES) {
      const source = withoutComments(read(path));
      expect(source, path).not.toMatch(/\bvoice agents?\b/i);
      expect(source, path).not.toMatch(/\bagent speaking\b/i);
      expect(source, path).not.toMatch(/\bagent name\b/i);
    }
  });

  it("resolves both legacy postures to the same customer language", () => {
    const personal = customerAgentLanguage("personal");
    const business = customerAgentLanguage("business");
    expect(personal).toEqual(business);
    expect(personal).toMatchObject({
      singular: "Bot",
      plural: "Bots",
      navLabel: "Workspace",
      createCta: "Create Bot",
      setupPrompt: "What Should Your Bot Do?",
    });
    expect(PRODUCT_POSTURE.personal).toEqual(PRODUCT_POSTURE.business);
    expect(formatAgentRoleLabel("ceo")).toBe("Lead Bot");
    expect(formatAgentRoleLabel("wireline_sales")).toBe("Sales");
    expect(formatAgentRoleLabel("wireline_reception")).toBe("Reception");
  });

  it("does not reintroduce personal-versus-business language on customer surfaces", () => {
    for (const path of UNIFIED_AUDIENCE_SURFACES) {
      const source = withoutComments(read(path));
      expect(source, path).not.toMatch(
        /add (?:a )?(?:personal|business) (?:account|workspace)|personal and business|business and personal|business-ready|personally discreet|business knowledge|personal & lifestyle/i,
      );
    }
  });

  it("preserves channel compatibility while promoting only the current launch capabilities", () => {
    expect(BOT_CHANNELS.map((channel) => channel.label)).toEqual(["Call", "Text", "Email"]);
    expect(BOT_CHANNELS.find((channel) => channel.key === "text")?.description).toContain(
      "SMS is coming soon",
    );
    expect(isReviewedOutboundCandidate({ phone_number: "+13125550100", channel: "voice" })).toBe(
      true,
    );
    expect(
      isReviewedOutboundCandidate({ phone_number: "+13125550100", channel: "omnichannel" }),
    ).toBe(true);
    expect(isReviewedOutboundCandidate({ phone_number: "+13125550100" })).toBe(true);
    expect(isReviewedOutboundCandidate({ phone_number: "", channel: "voice" })).toBe(false);
    expect(isReviewedOutboundCandidate({ phone_number: "+13125550100", channel: "email" })).toBe(
      false,
    );
    expect(MARKETING_VOICE.channelProof).toEqual(["Call", "Email", "Computer"]);
    expect(BOT_MARKETING_VOICE.spine).toEqual(["Call", "Email", "Computer"]);
    expect(WORKSPACE_VOICE.emptyCue).toContain("calls, email, knowledge, and computer tasks");
    expect(AGENT_NUMBER_PROMISE).toContain("Calls plans");
    expect(AGENT_NUMBER_PROMISE).toContain("BotBound number");
    expect(AGENT_NUMBER_PROMISE).toContain("answering incoming calls");
    expect(AGENT_NUMBER_PROMISE).not.toMatch(/personal plans|SMS|coming soon/i);
  });

  it("keeps Phone Bot, Conversation Bot, and Human Bot as configuration lenses", () => {
    expect(BOT_PRODUCT_TYPES.map((type) => type.name)).toEqual([
      "Phone Bot",
      "Conversation Bot",
      "Human Bot",
    ]);
    expect(BOT_PRODUCT_TYPES.find((type) => type.name === "Phone Bot")?.description).toContain(
      "Answer incoming calls",
    );
    expect(BOT_PRODUCT_TYPES.find((type) => type.name === "Phone Bot")?.description).not.toContain(
      "Live outbound dialing",
    );
    expect(
      BOT_PRODUCT_TYPES.find((type) => type.name === "Conversation Bot")?.description,
    ).toContain("calls and email");
    expect(BOT_PRODUCT_TYPES.find((type) => type.name === "Human Bot")?.description).toContain(
      "real human role",
    );
  });

  it("keeps role starters materially differentiated without forcing marketing categories", () => {
    const names = BOT_ROLE_TEMPLATES.map((template) => template.name);
    const directions = [
      ...new Set(BOT_ROLE_TEMPLATES.map((template) => template.direction)),
    ].sort();
    expect(directions).toEqual(["hybrid", "inbound"]);
    for (const role of [
      "Front Desk",
      "Sales Rep",
      "Appointment Setter",
      "Customer Support",
      "Lead Qualifier",
      "Recruiter",
      "Property Manager",
      "Personal Assistant",
      "Family Concierge",
      "Create Your Own",
    ]) {
      expect(names).toContain(role);
    }
    expect(names).not.toContain("Collections");
    for (const template of BOT_ROLE_TEMPLATES) {
      expect(template.moves).toHaveLength(3);
      expect(new Set(template.moves).size).toBe(3);
      expect(template.summary.length).toBeGreaterThan(24);
    }
    const landing = withoutComments(read("src/components/marketing/WireAgentLanding.tsx"));
    expect(landing).toContain("template.moves.map");
    expect(landing).not.toContain("template.category");
  });

  it("keeps role positioning concrete and action-oriented", () => {
    expect(AGENT_DIRECTION_MODES.outbound.label).toBe("Personal Assistant");
    expect(AGENT_DIRECTION_MODES.inbound.label).toBe("Receptionist");
    expect(AGENT_DIRECTION_MODES.hybrid.label).toBe("Flexible Assistant");
    expect(AGENT_DIRECTION_MODES.outbound.loop).toEqual(["Research", "Prepare", "Review", "Log"]);
    expect(AGENT_DIRECTION_MODES.inbound.loop).toEqual(["Answer", "Understand", "Help", "Log"]);
    expect(AGENT_DIRECTION_MODES.hybrid.loop).toEqual(["Answer", "Research", "Reply", "Log"]);
    expect(OUTBOUND_WEDGE.headline).toBe("A Bot That Helps With Everyday Plans");
    expect(OUTBOUND_WEDGE.subline).toContain("incoming questions");
    expect(OUTBOUND_WEDGE.subline).not.toMatch(/outbound|coming soon/i);
  });

  it("keeps the public entrance concise, auth-forward, and tied to shared constants", () => {
    for (const path of CORE_BUYING_SURFACES) {
      const source = read(path);
      expect(source, path).not.toContain("—");
      expect(source, path).not.toContain("AI VOICE AGENTS");
      expect(source, path).not.toMatch(/guaranteed profit|profit guarantee/i);
    }
    const landing = withoutComments(read("src/components/marketing/WireAgentLanding.tsx"));
    expect(landing).not.toContain("<AuthAccessPanel");
    expect(landing).toContain("<span>With a Computer,</span>");
    expect(landing).toContain("<span>and Email Address.</span>");
    expect(landing).not.toContain("landing-prestige__promise");
    expect(landing).toContain("landing-prestige__directions");
    expect(landing).not.toContain("HERO_CHANNEL_ORDER");
    expect(landing).not.toContain("HERO_CHANNELS.map");
    expect(landing).toContain("FEATURED_TEMPLATES.map");
    expect(landing).toContain("template.moves.map");
    expect(landing).toContain("STRIPE_PLANS");
    expect(landing).toContain("LandingFooter");
    expect(landing).toContain("<PrecisionPublicHeader />");
    expect(landing).not.toContain("Runtime Balance");
  });

  it("keeps shared marketing voice aligned to BotBound", () => {
    expect(MARKETING_VOICE.headline).toBe(BOT_BRAND.slogan);
    expect(MARKETING_VOICE.eyebrow).toBe("CALL · EMAIL · COMPUTER");
    expect(MARKETING_VOICE.primaryCta).toBe("Get Started");
    expect(MARKETING_VOICE.subline).toBe(BOT_BRAND.promise);
    expect(BOT_MARKETING_VOICE.headline).toBe(BOT_BRAND.slogan);
    expect(BOT_MARKETING_VOICE.primaryCta).toBe("Get Started");
    expect(BOT_MARKETING_VOICE.subline).toBe(BOT_BRAND.promise);
  });

  it("allocates one selected channel identity and preserves historical fleet limits", () => {
    const channelPlans = STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels");
    expect(channelPlans).toHaveLength(22);
    for (const plan of channelPlans) {
      const phone = plan.channels.includes("voice") || plan.channels.includes("sms");
      const email = plan.channels.includes("email");
      expect(plan.max_agents, plan.id).toBe(1);
      expect(plan.included_phone_numbers, plan.id).toBe(phone ? 1 : 0);
      expect(plan.included_mailboxes, plan.id).toBe(email ? 1 : 0);
      expect(plan.features.includes("1 local phone number"), plan.id).toBe(phone);
      expect(plan.features.includes("1 BotBound email address"), plan.id).toBe(email);
    }
    for (const plan of STRIPE_PLANS.filter((plan) => plan.catalogFamily === "legacy")) {
      expect(plan.included_phone_numbers, plan.id).toBe(plan.max_agents);
      expect(plan.features.join("\n"), plan.id).toMatch(/dedicated production number/i);
      expect(plan.features.join("\n"), plan.id).toMatch(/BotBound-managed email identity/i);
    }
    const billing = read("src/pages/BillingSettings.tsx");
    expect(billing).toContain("plan.included_phone_numbers");
  });

  it("keeps the authenticated route map intentional", () => {
    const routes = read("src/routes/AppRoutes.tsx");
    for (const path of [
      "/overview",
      "/studio",
      "/templates",
      "/knowledge",
      "/connections",
      "/phone",
      "/inbox",
      "/apps",
      "/settings",
      "/admin",
    ]) {
      expect(routes).toContain(`path="${path}"`);
    }
    expect(routes).toContain('path="/" element={<Navigate to="/studio" replace />}');
    expect(routes).toContain("ToStudioRedirect");
    expect(routes).toContain('path="/overview" element={<ToStudioRedirect />}');
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
      "/changelog",
      "/security",
      "/trust",
      "/privacy",
      "/terms",
      "/for/everyday",
      "/signin",
      "/signup",
      "/get-started",
      "/reset-password",
      "/oauth-complete",
      "/auth/oauth-complete",
    ];
    for (const path of publicPaths) expect(isSessionOptionalPublicPath(path), path).toBe(true);
    expect(existsSync("src/components/marketing/PublicSiteHeader.tsx")).toBe(false);
  });
});
