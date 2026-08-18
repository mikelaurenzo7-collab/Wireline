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
  BOT_WORKSPACE_PROMISE,
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

describe("one-workspace Bot product contract", () => {
  it("uses Bot as the customer object while retaining agent as the technical domain", () => {
    expect(BRAND_SYSTEM).toMatchObject({
      northStar: BOT_BRAND.promise,
      slogan: "BOTS THAT GET THE WORK DONE",
      supportingLine: "VOICE-FIRST BOTS FOR CALLS, LIVE CONVERSATIONS, TEXT, AND EMAIL",
      productNoun: "Bot",
      buyingNoun: "Bot",
      defaultRole: "Your Bot",
      productTypes: BOT_PRODUCT_TYPES,
      brandSpine: ["Build", "Configure", "Launch"],
      proofLoop: ["Build", "Configure", "Launch", "Improve"],
    });
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Present one Wireline workspace, never separate personal and business workspaces.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Treat employee roles as starting templates, not product categories or permanent limits.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Use Bot as the customer-facing object while keeping agent as the technical domain.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Use Voice Bot, Conversation Bot, and Human Bot as configurable starting points, never separate products or workspaces.",
    );
    expect(BRAND_SYSTEM.toneRules).toContain(
      "Never require customers to classify a Bot as personal or business before describing the work.",
    );
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

  it("keeps voice, live conversation, text, and email explicit", () => {
    expect(BOT_CHANNELS.map((channel) => channel.label)).toEqual(["Voice", "Text", "Email"]);
    expect(MARKETING_VOICE.channelProof).toEqual([
      "Voice calls",
      "Live conversations",
      "Text messages",
      "Email follow-up",
      "Shared knowledge",
      "Connected tools",
      "Clear guardrails",
    ]);
    expect(MARKETING_VOICE.spine).toEqual(BRAND_SYSTEM.brandSpine);
    expect(MARKETING_VOICE.proof).toEqual(BRAND_SYSTEM.proofLoop);
    expect(WORKSPACE_VOICE.emptyCue).toContain("voice, text, email");
    expect(AGENT_NUMBER_PROMISE).toContain("Every paid Bot");
    expect(AGENT_NUMBER_PROMISE).toContain("includes a Wireline number");
    expect(AGENT_NUMBER_PROMISE).toContain("answer and make calls");
  });

  it("defines Voice Bot, Conversation Bot, and Human Bot inside one product", () => {
    expect(BOT_PRODUCT_TYPES.map((type) => type.name)).toEqual([
      "Voice Bot",
      "Conversation Bot",
      "Human Bot",
    ]);
    expect(BOT_PRODUCT_TYPES.find((type) => type.name === "Voice Bot")?.description).toContain(
      "Answer inbound calls",
    );
    expect(
      BOT_PRODUCT_TYPES.find((type) => type.name === "Conversation Bot")?.description,
    ).toContain("voice, text, and email");
    expect(BOT_PRODUCT_TYPES.find((type) => type.name === "Human Bot")?.description).toContain(
      "real human role",
    );
  });

  it("keeps employee roles, personal starters, and Create Your Own in one template catalog", () => {
    const names = BOT_ROLE_TEMPLATES.map((template) => template.name);
    const categories = [...new Set(BOT_ROLE_TEMPLATES.map((template) => template.category))].sort();
    const directions = [...new Set(BOT_ROLE_TEMPLATES.map((template) => template.direction))].sort();

    expect(categories).toEqual(["Business", "Custom", "Personal"]);
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
    expect(BOT_WORKSPACE_PROMISE.title).toBe("ONE WORKSPACE. EVERY BOT.");
    expect(BOT_WORKSPACE_PROMISE.description).toContain("same workspace");
    expect(BOT_WORKSPACE_PROMISE.description).toContain("shared context");
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

  it("keeps public buying copy clean and tied to shared Bot constants", () => {
    for (const path of CORE_BUYING_SURFACES) {
      const source = read(path);
      expect(source, path).not.toContain("—");
      expect(source, path).not.toContain("AI VOICE AGENTS");
      expect(source, path).not.toMatch(/guaranteed profit|profit guarantee/i);
    }

    const landing = withoutComments(read("src/components/marketing/WireAgentLanding.tsx"));
    expect(landing).toContain("BOT_ROLE_TEMPLATES.map");
    expect(landing).toContain("BOT_CHANNELS.map");
    expect(landing).toContain("BOT_WORKSPACE_PROMISE.title");
    expect(landing).toContain('aria-label="Bot template lane"');
    expect(landing).toContain('aria-label="Bot channels"');
    expect(landing).toContain("Create Your Bot");
    expect(landing).toContain("Runtime Balance");
    expect(landing).not.toContain("posture=");
  });

  it("keeps shared marketing and application voice aligned", () => {
    expect(MARKETING_VOICE.headline).toBe(BOT_BRAND.slogan);
    expect(MARKETING_VOICE.primaryCta).toBe("Build Your Bot");
    expect(MARKETING_VOICE.subline).toContain("answers and makes calls");
    expect(MARKETING_VOICE.subline).toContain("text and email");
    expect(MARKETING_VOICE.subline).toContain("one workspace");
    expect(BOT_MARKETING_VOICE.headline).toBe(BOT_BRAND.slogan);
    expect(BOT_MARKETING_VOICE.primaryCta).toBe("Build Your Bot");
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
