import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("bot visual identity", () => {
  it("uses a compact role-agnostic Bot Mark as the active identity primitive", () => {
    const mark = source("src/components/BotMark.tsx");
    const policy = source("src/lib/bot-mark.ts");

    expect(mark).toContain("botMarkFor");
    expect(mark).toContain("rounded-full");
    expect(mark).toContain("imageUrl");
    expect(mark).toContain("mark.initial");
    expect(policy).toContain("role never affects the mark");
    expect(policy).toContain("BOT_MARK_PALETTE");
    expect(policy).not.toContain("status-success");
    expect(policy).not.toContain("status-warning");
    expect(policy).not.toContain("status-error");
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

  it("keeps Fast Start free of avatar and presenter choices", () => {
    const dialog = source("src/components/CreateAgentDialog.tsx");
    expect(dialog).toContain("Not Now");
    expect(dialog).not.toMatch(/CreateAgentCatalogFacePicker|AgentPresenceAvatarPicker|avatar/i);
  });
});

describe("Live Video retirement", () => {
  it("removes the product page while preserving safe historical deep links", () => {
    const routes = source("src/routes/AppRoutes.tsx");
    const page = source("src/pages/LiveVideoStudioPage.tsx");

    expect(routes).not.toContain('lazy(() => import("../pages/LiveVideoStudioPage"))');
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

    expect(registry).not.toContain('import videoPresenterRouter from "../routes/video-presenter-routes"');
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
    expect(contract).toContain("Retired Live Video must stay out of the active Founder Stripe manifest");
    expect(contract).toContain("FOUNDER_PRODUCTS.length !== 7");
    expect(contract).toContain("FOUNDER_PRICES.length !== 13");
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