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
  "src/components/OutboundDialDialog.tsx",
  "src/components/outbound/CampaignsPanel.tsx",
  "src/components/marketing/BrowserCallWidget.tsx",
  "src/lib/voice/xai-public-demo-session.ts",
] as const;

describe("Phone Bot product voice", () => {
  it("uses Bot as the customer object while retaining agent as the technical domain", () => {
    expect(BOT_BRAND).toMatchObject({
      name: "WIRELINE",
      slogan: "WIRE YOUR PHONE BOT",
      supportingLine: "CALL · EMAIL · TEXT",
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
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Use Phone Bot as the public acquisition wedge; Call, Email, and Text are the compact channel proof.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Treat workspace architecture as product proof, never as a marketing headline.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Never require customers to classify a Bot as personal or business before describing the work.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Leave room for curiosity; do not explain every capability before account entry.",
    );
  });

  it("keeps operational customer surfaces on Bot terminology", () => {
    for (const path of CUSTOMER_BOT_SURFACES) {
      const source = withoutComments(read(path));
      expect(source, path).not.toMatch(/\bvoice agents?\b/i);
      expect(source, path).not.toMatch(/\bagent speaking\b/i);
    }
  });

  it("resolves both legacy postures to the same customer language", () => {
    const personal = customerAgentLanguage("personal");
    const business = customerAgentLanguage("business");
    expect(personal).toEqual(business);
    expect(personal).toMatchObject({
      singular: "Bot",
      plural: "Bots",
      navLabel: "Bot Studio",
      createCta: "Create Bot",
      setupPrompt: "What should your Bot do?",
    });
    expect(PRODUCT_POSTURE.personal).toEqual(PRODUCT_POSTURE.business);
    expect(formatAgentRoleLabel("ceo")).toBe("Lead Bot");
  });

  it("makes Phone Bot concrete while keeping all three channels explicit", () => {
    expect(BOT_CHANNELS.map((channel) => channel.label)).toEqual(["Call", "Email", "Text"]);
    expect(MARKETING_VOICE.channelProof).toEqual(["Call", "Email", "Text"]);
    expect(BOT_MARKETING_VOICE.spine).toEqual(["Call", "Email", "Text"]);
    expect(WORKSPACE_VOICE.emptyCue).toContain("calls, email, text");
    expect(AGENT_NUMBER_PROMISE).toContain("Every paid Bot");
    expect(AGENT_NUMBER_PROMISE).toContain("includes a WIRELINE number");
    expect(AGENT_NUMBER_PROMISE).toContain("answer and make calls");
  });

  it("keeps Phone Bot, Conversation Bot, and Human Bot as configuration lenses", () => {
    expect(BOT_PRODUCT_TYPES.map((type) => type.name)).toEqual([
      "Phone Bot",
      "Conversation Bot",
      "Human Bot",
    ]);
    expect(BOT_PRODUCT_TYPES.find((type) => type.name === "Phone Bot")?.description).toContain(
      "inbound and outbound calls",
    );
    expect(
      BOT_PRODUCT_TYPES.find((type) => type.name === "Conversation Bot")?.description,
    ).toContain("calls, email, and text");
    expect(BOT_PRODUCT_TYPES.find((type) => type.name === "Human Bot")?.description).toContain(
      "real human role",
    );
  });

  it("keeps role starters materially differentiated without marketing category labels", () => {
    const names = BOT_ROLE_TEMPLATES.map((template) => template.name);
    const directions = [...new Set(BOT_ROLE_TEMPLATES.map((template) => template.direction))].sort();
    expect(directions).toEqual(["hybrid", "inbound", "outbound"]);
    for (const role of [
      "Front Desk",
      "Sales Rep",
      "Appointment Setter",
      "Customer Support",
      "Lead Qualifier",
      "Recruiter",
      "Collections",
      "Property Manager",
      "Personal Assistant",
      "Family Concierge",
      "Create Your Own",
    ]) {
      expect(names).toContain(role);
    }
    for (const template of BOT_ROLE_TEMPLATES) {
      expect(template.moves).toHaveLength(3);
      expect(new Set(template.moves).size).toBe(3);
      expect(template.summary.length).toBeGreaterThan(24);
    }

    const landing = withoutComments(read("src/components/marketing/WireAgentLanding.tsx"));
    expect(landing).toContain("template.moves.map");
    expect(landing).not.toContain("template.category");
    expect(landing).not.toMatch(/>Business<|>Personal<|>Custom</);
  });

  it("keeps role positioning concrete and action-oriented", () => {
    expect(AGENT_DIRECTION_MODES.outbound.label).toBe("Sales Associate");
    expect(AGENT_DIRECTION_MODES.inbound.label).toBe("Receptionist");
    expect(AGENT_DIRECTION_MODES.hybrid.label).toBe("All-Purpose Bot");
    expect(AGENT_DIRECTION_MODES.outbound.loop).toEqual(["Research", "Call", "Book", "Log"]);
    expect(AGENT_DIRECTION_MODES.inbound.loop).toEqual(["Answer", "Qualify", "Act", "Log"]);
    expect(AGENT_DIRECTION_MODES.hybrid.loop).toEqual(["Answer", "Act", "Follow Up", "Sync"]);
    expect(OUTBOUND_WEDGE.headline).toBe("A Bot That Moves Growth Work Forward");
    for (const verb of ["researches", "calls", "texts", "emails", "books", "logs proof"]) {
      expect(OUTBOUND_WEDGE.subline.toLowerCase()).toContain(verb);
    }
  });

  it("keeps the public entrance concise, auth-forward, and tied to shared constants", () => {
    for (const path of CORE_BUYING_SURFACES) {
      const source = read(path);
      expect(source, path).not.toContain("—");
      expect(source, path).not.toContain("AI VOICE AGENTS");
      expect(source, path).not.toMatch(/guaranteed profit|profit guarantee/i);
    }

    const landing = withoutComments(read("src/components/marketing/WireAgentLanding.tsx"));
    expect(landing).toContain("<AuthAccessPanel embedded");
    expect(landing).toContain("WIRE YOUR");
    expect(landing).toContain("PHONE BOT");
    expect(landing).toContain('const HERO_CHANNEL_ORDER = ["voice", "email", "text"] as const;');
    expect(landing).toContain("BOT_CHANNELS.find((candidate) => candidate.key === key)");
    expect(landing).toContain("return channel.label.toUpperCase()");
    expect(landing).toContain("FEATURED_TEMPLATES.map");
    expect(landing).toContain("template.moves.map");
    expect(landing).toContain("STRIPE_PLANS");
    expect(landing).toContain("LandingFooter");
    expect(landing).not.toContain("BOT_CHANNELS.map");
    expect(landing).not.toContain("BOT_WORKSPACE_PROMISE.title");
    expect(landing).not.toContain("PrecisionPublicHeader");
    expect(landing).not.toContain("Runtime Balance");
    expect(landing).not.toContain("posture=");
  });

  it("keeps shared marketing voice aligned to the acquisition wedge", () => {
    expect(MARKETING_VOICE.headline).toBe(BOT_BRAND.slogan);
    expect(MARKETING_VOICE.eyebrow).toBe("CALL · EMAIL · TEXT");
    expect(MARKETING_VOICE.primaryCta).toBe("Start Free");
    expect(MARKETING_VOICE.subline).toBe(BOT_BRAND.promise);
    expect(BOT_MARKETING_VOICE.headline).toBe(BOT_BRAND.slogan);
    expect(BOT_MARKETING_VOICE.primaryCta).toBe("Start Free");
    expect(BOT_MARKETING_VOICE.subline).toBe(BOT_BRAND.promise);
  });

  it("keeps included phone capacity aligned to live Bot capacity", () => {
    const publicCapacityPlans = STRIPE_PLANS.filter(
      (plan) => plan.id !== "enterprise" && plan.id !== "personal",
    );
    for (const plan of publicCapacityPlans) {
      expect(plan.included_phone_numbers, plan.id).toBe(plan.max_agents);
    }

    const catalog = read("src/lib/plan-catalog.ts");
    const billing = read("src/pages/BillingSettings.tsx");
    expect(catalog).toContain(
      "Every paid tier guarantees live voice capacity and an on-demand number slot",
    );
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
    expect(routes).toContain('to="/phone?tab=logs"');
    expect(routes).toContain("AgentsToStudioRedirect");
    for (const retiredPath of [
      "/actions",
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
      "/status",
      "/changelog",
      "/security",
      "/trust",
      "/privacy",
      "/terms",
      "/for/personal",
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
    expect(existsSync("src/components/marketing/PublicSiteHeader.tsx")).toBe(false);
  });
});
