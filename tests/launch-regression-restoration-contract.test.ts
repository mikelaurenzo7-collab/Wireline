import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isBusinessTemplateCategory,
  PERSONAL_DEFAULT_TEMPLATE_ID,
  PERSONAL_FAST_START_ROLE,
  resolveCreateEnabledTools,
  resolveCreatePersonality,
} from "../src/lib/agent-create-defaults";
import {
  applyPlanToolUnlocks,
  BUSINESS_TOOL_NAMES,
  getDefaultAgentTools,
  getRoleToolSet,
  resolveAgentTools,
} from "../src/lib/agent-capabilities";
import { composeSetupPersonality } from "../src/lib/compose-setup-personality";
import { WIRELINE_DESIGN_VISION } from "../src/lib/wireline-design-vision";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("restored launch regression guards", () => {
  it("preserves rich personal Bot defaults without representing the Bot as the principal", () => {
    expect(PERSONAL_FAST_START_ROLE).toBe("personal_assistant");
    expect(PERSONAL_DEFAULT_TEMPLATE_ID).toBe("personal-concierge");

    const personal = resolveCreatePersonality({
      role: PERSONAL_FAST_START_ROLE,
      isBusinessAgent: false,
      agentName: "Sarah",
    });
    expect(personal).toContain("elite personal assistant");
    expect(personal).toContain("TEMPLATE SPECIALTY: Personal Concierge");
    expect(personal).toContain("You represent your principal");
    expect(personal).not.toContain("You represent Sarah");

    const business = resolveCreatePersonality({
      role: "sales",
      isBusinessAgent: true,
      templateId: "sales-sdr",
      agentName: "Revenue Desk",
    });
    expect(business).toContain("from your business");
    expect(business).not.toContain("from Revenue Desk");

    const rich =
      "You are an elite personal assistant.\n\n## TEMPLATE SPECIALTY: Personal Concierge\nBook appointments and take messages.";
    const composed = composeSetupPersonality(rich, "Warm", false);
    expect(composed).toContain("elite personal assistant");
    expect(composed).toContain("TEMPLATE SPECIALTY: Personal Concierge");
    expect(composed).toContain("## DELIVERY TONE");
    expect(composed).toContain("personally discreet");

    const voiceRuntime = read("src/lib/vapi-assistant-factory-v2.ts");
    expect(voiceRuntime).toContain("a personal Wireline agent for your principal");
    expect(voiceRuntime).toContain("## QUIET-HOURS MODE");
    expect(voiceRuntime).toContain("Never invent personal facts");
  });

  it("keeps personal and business tool defaults scoped while explicit selections stay authoritative", () => {
    const personalTools = resolveCreateEnabledTools("personal_assistant", false);
    const businessTools = resolveCreateEnabledTools("sales", true);
    const deviceActions = ["navigate_to", "add_reminder", "play_music"] as const;

    expect(personalTools.length).toBeGreaterThan(0);
    for (const tool of personalTools) expect(BUSINESS_TOOL_NAMES.has(tool)).toBe(false);
    for (const tool of deviceActions) {
      expect(personalTools).not.toContain(tool);
      expect(businessTools).not.toContain(tool);
    }

    expect(businessTools.length).toBeLessThan(getDefaultAgentTools().length);
    expect(businessTools).toContain("send_email");
    expect(businessTools).toContain("book_appointment");
    expect(businessTools).toContain("crm_create_opportunity");
    expect(businessTools).toContain("send_contract");
    expect(personalTools).toContain("book_appointment");
    expect(personalTools).toContain("send_text_message");

    const selected = ["send_email", "book_appointment"] as const;
    expect(applyPlanToolUnlocks(selected, "enterprise")).toEqual(selected);
    expect(resolveAgentTools("sales", selected)).toEqual(selected);
    const personalRole = getRoleToolSet("personal_assistant");
    expect(personalRole).not.toContain("send_slack_notification");
    expect(personalRole).not.toContain("send_teams_message");
    expect(personalRole).not.toContain("send_contract");
    expect(resolveAgentTools("sales", null)).toEqual(getDefaultAgentTools());
  });

  it("keeps legacy capability classification only as compatibility, not workspace navigation", () => {
    expect(isBusinessTemplateCategory("Personal & Lifestyle")).toBe(false);
    expect(isBusinessTemplateCategory("Sales & Revenue")).toBe(true);
    expect(isBusinessTemplateCategory(null)).toBe(true);

    const templates = read("src/components/AgentTemplates.tsx");
    const mobile = read("src/routes/mobile-routes.ts");
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    const dialog = read("src/components/CreateAgentDialog.tsx");
    expect(templates).toContain("isBusinessTemplateCategory(modalTemplate.category)");
    expect(mobile).toContain("resolveCreateEnabledTools(role, isBusinessAgent)");
    expect(mobile).toContain("resolveCreatePersonality");
    expect(agentRoutes).toContain("resolveCreatePersonality");
    expect(agentRoutes).toContain("resolveCreateEnabledTools(role, isBusinessAgent)");
    expect(dialog).toContain("BOT_ROLE_TEMPLATES.map");
    expect(dialog).toContain("BOT_CHANNELS.map");
    expect(dialog).toContain('workspace_model: "one_workspace"');
    expect(dialog).not.toMatch(/setPosture|rolesForPosture|Choose one personal job/);
  });

  it("keeps one roster while preserving legacy seed flags for safe migrations", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const shell = read("src/components/WorkspaceShell.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const founderSeed = read("src/lib/founder-fleet-seed.ts");

    expect(overview).toContain("UnifiedInbox");
    expect(overview).toContain("BotRoster");
    expect(overview).toContain("Create Your Own");
    expect(overview).not.toMatch(/personalAgents|businessAgents|founderPair|posture=/);
    expect(shell).toContain("const orderedAgents = activeAgent");
    expect(shell).toContain("{agents.length}");
    expect(shell).not.toContain("const postureAgents =");
    expect(shell).not.toContain("matchesPosture");
    expect(studio).not.toContain("useAccount");
    expect(studio).not.toContain("posture=");
    expect(founderSeed).toContain("isBusinessAgent: false");
    expect(founderSeed).toContain("isBusinessAgent:");
  });

  it("keeps Stripe launch-status verification deep instead of reducing it to a catalog presence check", () => {
    const grace = read("src/lib/voice-completion-grace.ts");
    const continuity = read("tests/live-call-billing-continuity-contract.test.ts");
    const script = read("scripts/generate-launch-status.mjs");
    const manifest = read("scripts/lib/stripe-founder-catalog.mjs");

    expect(grace).toContain("temporary negative Runtime Balance");
    expect(continuity).toContain("temporary negative Runtime Balance");
    expect(continuity).not.toContain("temporary negative Conversation Balance");
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
    expect(script).toContain("brandingPrimaryColor === STRIPE_BRAND_PRIMARY_COLOR");
    expect(script).toContain("brandingSecondaryColor === STRIPE_BRAND_SECONDARY_COLOR");
    expect(script).toContain("managed_configuration_missing");
    expect(script).toContain("plan_switch_prices_mismatch");
    expect(script).toContain('subscription_cancel?.mode === "at_period_end"');
    expect(script).toContain("catalog_version_mismatch");
    expect(script).toContain("price_key_mismatch");
    expect(script).toContain("stripe_public_catalog_not_aligned");
  });

  it("keeps Knowledge and compliance surfaces fail-closed and customer-safe", () => {
    const kb = read("src/components/KnowledgeBaseClaude.tsx");
    const routes = read("src/routes/agent-routes-v2.ts");
    const checklist = read("src/components/admin/ComplianceChecklist.tsx");
    const security = read("src/components/Security.tsx");
    const compliance = read("src/components/ComplianceCenter.tsx");
    expect(routes).toContain("Upload a text document or a PNG, JPG, WEBP, or GIF image.");
    expect(kb).toContain(
      'accept=".txt,.csv,.md,.markdown,image/png,image/jpeg,image/jpg,image/webp,image/gif"',
    );
    expect(kb).toContain("TXT, MD, CSV, or images (PNG, JPG, WEBP, GIF)");
    expect(kb).not.toContain("PDF, DOCX, TXT, CSV");
    expect(kb).toContain("is not supported yet");
    expect(kb).toContain("Knowledge could not be loaded.");
    expect(checklist).toContain("intRes != null &&");
    expect(checklist).toContain("dncRes != null && dncLen > 0");
    expect(security).toMatch(
      /Marketing and campaign outbound[^.]*fail closed[^.]*stay blocked[^.]*federal DNC setup/i,
    );
    expect(security).not.toContain("DNCScrub");
    expect(security).not.toContain("FEDERAL_DNC_API_KEY");
    expect(compliance).toContain("Marketing outbound blocked");
    expect(compliance).not.toContain("DNCScrub");
  });

  it("keeps contact and support fallbacks limited to transport or service failures", () => {
    const contact = read("src/components/ContactPage.tsx");
    const support = read("src/components/SupportPage.tsx");
    for (const source of [contact, support]) {
      expect(source).toContain("responseStatus = response.status");
      expect(source).toContain("responseStatus !== null && responseStatus >= 500");
      expect(source).toContain("mailto:support@trywireline.com");
      expect(source).toContain("setError(message)");
      expect(source).toContain("isTransport");
    }
    expect(contact).toContain("Only fall back to mailto for transport/service failures");
    expect(read("src/components/AdminSettings.tsx")).toContain('toastError("Team unavailable"');
  });

  it("keeps high-value letterpress accessibility and brand guards outside Overview markup", () => {
    const polish = read("src/styles/letterpress-polish.css");
    expect(polish).toMatch(/\.wl-eyebrow::before[\s\S]{0,160}content: none/);
    expect(polish).toMatch(
      /\.wl-press-highlight::before[\s\S]*var\(--wireline-color-pressHighlight\)/,
    );
    expect(polish).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.wl-skeleton::after[\s\S]*animation: none/,
    );
    expect(polish).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.wl-press[\s\S]*transform: none/,
    );
    expect(polish).not.toMatch(/#5D3FD3|#451EBB|#C77DFF|#F8F9FF|#EFF4FF|#E5EEFF/i);
    expect(polish).toContain(".wl-reveal-6");
    expect(polish).toContain(".wl-reveal-7");
    expect(polish).toContain(".wl-reveal-8");

    expect(WIRELINE_DESIGN_VISION.utilities).toEqual(
      expect.objectContaining({
        feedback: expect.arrayContaining([
          "wl-focus-ring",
          "wl-focus-ring-halo",
          "wl-focus-ring-wire",
          "wl-glow-primary",
          "wl-glow-wire",
        ]),
        motion: expect.arrayContaining([
          "wl-press",
          "wl-motion-spring",
          "wl-motion-wireline",
          "wl-transition-press",
          "wl-reveal",
        ]),
      }),
    );

    const notFound = read("src/components/layout/NotFound.tsx");
    expect(notFound).toContain("wl-display-mark");
    expect(notFound).toContain("wl-eyebrow");
    expect(notFound).toContain("wl-paper");
    expect(notFound).toContain("wl-code");

    const email = read("src/components/layout/EmailVerifyBanner.tsx");
    expect(existsSync(resolve(root, "src/components/layout/TrialBanner.tsx"))).toBe(false);
    expect(email).toContain("wl-banner--info");
    expect(polish).toContain(".wl-banner--warn");
    expect(polish).toContain(".wl-banner--critical");
  });

  it("keeps canonical atoms, tokens, app signatures, and auth focus treatment", () => {
    const button = read("src/components/atoms/Button.tsx");
    const card = read("src/components/molecules/Card.tsx");
    const empty = read("src/components/atoms/EmptyState.tsx");
    const skeleton = read("src/components/atoms/Skeleton.tsx");
    const tokens = read("src/styles/tokens.generated.css");
    const signature = read("src/styles/wireline-app-signature.css");
    const billing = read("src/components/StripeBillingCard.tsx");
    const auth = read("src/styles/precision-auth.css");
    const portal = read("src/components/AuthPortal.tsx");

    expect(button).toMatch(/wire:\s*"/);
    expect(button).toContain("var(--wireline-elevation-wireGlow)");
    expect(card).toContain("var(--wireline-elevation-inset)");
    expect(card).toMatch(/paper:\s*"/);
    expect(card).toMatch(/recessed:\s*"/);
    expect(card).toMatch(/wire:\s*"/);
    expect(empty).toContain("wl-empty");
    expect(skeleton).toContain("wl-skeleton");

    for (const token of [
      "--wireline-color-action-primary-hover: #C4B5FD",
      "--wireline-color-focus-wire: #C7CCD6",
      "--wireline-motion-duration-deliberate: 440ms",
      "--wireline-interaction-target-primary: 48px",
    ]) {
      expect(tokens).toContain(token);
    }

    expect(signature).toMatch(/\.wl-workspace-content \.wl-paper::before/);
    expect(signature).toMatch(/\.wl-overview \.wl-metric-tile::before/);
    expect(signature).toMatch(/\.wl-operate-surface \.wl-paper::before/);
    expect(billing).not.toMatch(/amber-500|rose-500|text-white/);
    expect(billing).toContain("Chip");
    expect(auth).toMatch(
      /\.wl-stitch-oauth-btn:focus-visible[\s\S]*var\(--wireline-color-focus-default\)/,
    );
    expect(auth).toMatch(/\.wl-stitch-auth-shell[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(portal).toContain("max-w-[520px]");
    expect(portal).not.toContain("AuthBrandPanel");
  });
});