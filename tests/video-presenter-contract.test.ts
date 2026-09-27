import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BOT_MARK_CHOICES, BOT_MARK_SIGNATURE_CAPACITY, botMarkFor } from "../src/lib/bot-mark";
import { MAX_EXTRA_AGENT_ADDONS } from "../src/lib/agent-capacity";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("bot visual identity", () => {
  it("uses a curated selectable Bot identity mark rather than a generic avatar token", () => {
    const mark = source("src/components/BotMark.tsx");
    const policy = source("src/lib/bot-mark.ts");
    const optics = source("src/styles/bot-mark.css");
    const index = source("src/index.css");

    expect(mark).toContain("botMarkFor");
    expect(mark).toContain("MOTIF_ICONS");
    expect(mark).toContain("data-mark-key={mark.key}");
    expect(mark).toContain("imageUrl");
    expect(mark).toContain('data-active={active ? "true" : "false"}');
    expect(mark).not.toContain("monogram");
    expect(mark).not.toContain("mark.initial");

    expect(policy).toContain("Fifteen distinct symbols cover the largest published");
    expect(policy).toContain("120 unique combinations");
    expect(policy).toContain("Role and runtime status never choose");
    expect(policy).toContain("BOT_MARK_CHOICES");
    expect(policy).toContain("BOT_MARK_PALETTE");
    expect(policy).toContain("BOT_MARK_GRADIENT_CAPACITY");
    expect(policy).toContain("BOT_MARK_MOTIFS");
    expect(policy).not.toContain("botMarkInitial");
    expect(policy).not.toContain("initial:");
    for (const motif of [
      "orbit",
      "beacon",
      "spark",
      "prism",
      "flow",
      "pulse",
      "compass",
      "focus",
      "aperture",
      "wave",
      "helix",
      "loop",
      "nova",
      "route",
      "vertex",
    ]) {
      expect(policy).toContain(`"${motif}"`);
    }
    expect(policy).not.toContain("status-success");
    expect(policy).not.toContain("status-warning");
    expect(policy).not.toContain("status-error");

    expect(optics).toContain(".wl-bot-mark__glyph");
    expect(optics).toContain("forced-colors: active");
    expect(optics).not.toContain("wl-bot-mark__monogram");
    expect(optics).not.toContain("--wireline-color-status-success");
    expect(optics).not.toContain("--wireline-color-status-warning");
    expect(optics).not.toContain("--wireline-color-status-error");
    expect(index).toContain('@import "./styles/bot-mark.css";');
  });

  it("keeps stable fallback signatures beyond commercial capacity and limits choices to the catalog", () => {
    const plans = source("src/lib/plan-catalog.ts");
    const baseCaps = [...plans.matchAll(/max_agents:\s*(\d+)/g)].map((match) => Number(match[1]));
    const maximumStandardCapacity = Math.max(...baseCaps) + MAX_EXTRA_AGENT_ADDONS;

    expect(Math.max(...baseCaps)).toBe(15);
    expect(MAX_EXTRA_AGENT_ADDONS).toBe(100);
    expect(maximumStandardCapacity).toBe(115);
    expect(BOT_MARK_SIGNATURE_CAPACITY).toBeGreaterThan(maximumStandardCapacity);
    expect(BOT_MARK_CHOICES.length).toBeGreaterThan(maximumStandardCapacity);

    const marks = Array.from({ length: maximumStandardCapacity }, (_, index) =>
      botMarkFor({ id: `capacity-${index}` }),
    );
    expect(new Set(marks.map((mark) => mark.gradientSignature)).size).toBe(maximumStandardCapacity);
    expect(new Set(marks.map((mark) => mark.key)).size).toBeLessThanOrEqual(
      BOT_MARK_CHOICES.length,
    );
    expect(botMarkFor({ id: "stable-bot" }).key).toBe(botMarkFor({ id: "stable-bot" }).key);
  });

  it("retires human/cartoon face rendering without forcing an unsafe all-at-once import rename", () => {
    const compatibility = source("src/components/AgentFace.tsx");
    expect(compatibility).toContain('import BotMark from "./BotMark"');
    expect(compatibility).toContain("Human/cartoon faces are retired");
    expect(compatibility).not.toContain("HairShape");
    expect(compatibility).not.toContain("faceConfigFor");
    expect(compatibility).not.toContain("<ellipse");
    expect(compatibility).not.toContain("<path");
  });

  it("uses Bot Marks directly in the primary Overview roster", () => {
    const rail = source("src/components/overview/OverviewRail.tsx");
    expect(rail).toContain('import BotMark from "../BotMark"');
    expect(rail).toContain("<BotMark");
    expect(rail).toContain("seed={bot.id}");
    expect(rail).toContain("title={`${bot.name} mark`}");
    expect(rail).not.toContain("<AgentFace");
  });

  it("keeps Fast Start and the tracked client tree free of avatar selection UI", () => {
    const dialog = source("src/components/CreateAgentDialog.tsx");
    expect(dialog).toContain("Cancel");
    expect(dialog).not.toMatch(/CreateAgentCatalogFacePicker|AgentPresenceAvatarPicker|avatar/i);
    expect(existsSync(resolve(root, "src/components/AgentPresenceAvatarPicker.tsx"))).toBe(false);
  });
});

describe("Live Video retirement", () => {
  it("removes the product page while preserving safe historical deep links", () => {
    const routes = source("src/routes/AppRoutes.tsx");
    const page = source("src/pages/LiveVideoStudioPage.tsx");

    expect(routes).not.toContain("LiveVideoStudioPage");
    expect(routes).toContain(
      '<Route path="/studio/live-video" element={<Navigate to="/studio" replace />} />',
    );
    expect(page).toContain('<Navigate to="/studio" replace />');
    expect(page).not.toContain("authFetch(");
    expect(page).not.toContain("<select");
    expect(page).not.toContain("<AgentFace");
  });

  it("does not mount presenter APIs and terminates stale checkout before legacy billing", () => {
    const registry = source("src/server/register-api-routes.ts");

    expect(registry).not.toContain(
      'import videoPresenterRouter from "../routes/video-presenter-routes"',
    );
    expect(registry).not.toContain("app.use(videoPresenterRouter)");
    expect(registry).toContain('app.all("/api/billing/live-video-checkout"');
    expect(registry).toContain('error: "FEATURE_RETIRED"');
    expect(registry).toContain("res.status(410)");

    const terminalCheckout = registry.indexOf('app.all("/api/billing/live-video-checkout"');
    const legacyBillingMount = registry.indexOf('app.use("/api", billingRouter)');
    expect(terminalCheckout).toBeGreaterThan(-1);
    expect(legacyBillingMount).toBeGreaterThan(terminalCheckout);
  });

  it("keeps archived presenter routes fail-closed if they are ever mounted during rollback", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain('"LIVE_VIDEO_RETIRED"');
    expect(routes).toContain('router.get("/api/video-presenter/avatars"');
    expect(routes).toContain('"/api/agents/:id/video-presenter/session"');
    expect(routes).toContain("throwLiveVideoRetired");
    expect(routes).toContain('code: "LIVE_VIDEO_SAMPLE_RETIRED"');
  });

  it("keeps Live Video out of the active Stripe catalog", () => {
    const catalog = source("scripts/lib/stripe-founder-catalog.mjs");
    const contract = source("scripts/check-stripe-catalog-contract.mjs");

    expect(catalog).not.toContain('key: "live_video"');
    expect(catalog).not.toContain('key: "live_video_monthly"');
    expect(catalog).not.toContain("STRIPE_LIVE_VIDEO_ADDON_PRICE_ID");
    expect(contract).toContain(
      "Retired Live Video must stay out of the active Founder Stripe manifest",
    );
    expect(contract).toContain("FOUNDER_PRODUCTS.length !== expectedPlans.length + 2");
    expect(contract).toContain("FOUNDER_PRICES.length !== expectedPlans.length * 2 + 4");
  });

  it("reports no live-video engines while retaining historical provider ids for old records", () => {
    expect(source("src/routes/health-routes.ts")).toContain("live_video_engines: []");
    expect(source("src/routes/health-routes.ts")).toContain("live_video_retired: true");

    const identity = source("src/lib/agent-identity.ts");
    expect(identity).toContain('"liveavatar"');
    expect(identity).toContain('"tavus"');
    expect(identity).toContain('providerPreference: VideoPresenterProviderId = "synthetic"');
  });
});
