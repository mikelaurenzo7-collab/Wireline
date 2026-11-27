import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveCreateEnabledTools,
  resolveCreatePersonality,
} from "../src/lib/agent-create-defaults";
import {
  applyPlanToolUnlocks,
  BUSINESS_TOOL_NAMES,
  getDefaultAgentTools,
  resolveAgentTools,
} from "../src/lib/agent-capabilities";
import { DEFAULT_BOT_ARCHETYPE } from "../src/lib/agent-constants";
import { composeSetupPersonality } from "../src/lib/compose-setup-personality";
import { WIRELINE_DESIGN_VISION } from "../src/lib/wireline-design-vision";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("restored launch regression guards", () => {
  it("keeps a new Bot from representing itself as the principal or the business", () => {
    // One Bot means there is no personal role or template to seed from. What
    // still has to hold is that the Bot's own name never fills the principal
    // or business slot, on either account type.
    const personal = resolveCreatePersonality({ isBusinessAgent: false, agentName: "Sarah" });
    expect(personal).toContain("## PERSONAL POSTURE");
    expect(personal).toContain("one principal in their personal life, not a business");
    expect(personal).toContain("Speak for them rather than about them");
    expect(personal).not.toContain("Sarah");

    const business = resolveCreatePersonality({
      isBusinessAgent: true,
      agentName: "Revenue Desk",
    });
    expect(business).not.toContain("## PERSONAL POSTURE");
    expect(business).not.toContain("Revenue Desk");

    // Business tokens never leak a literal placeholder, and a personal account
    // resolves them to the principal rather than to a business.
    expect(
      resolveCreatePersonality({ isBusinessAgent: true, agentName: "Revenue Desk" }),
    ).not.toMatch(/\{\{\w+\}\}/);

    const rich =
      "You are an elite personal assistant.\n\n## TEMPLATE SPECIALTY: Personal Concierge\nBook appointments and take messages.";
    const composed = composeSetupPersonality(rich, "Warm");
    expect(composed).toContain("elite personal assistant");
    expect(composed).toContain("TEMPLATE SPECIALTY: Personal Concierge");
    expect(composed).toContain("## DELIVERY TONE");
    expect(composed).toContain("Concise, useful, and discreet");

    const voiceRuntime = read("src/lib/voice/openai-phone-agent-runtime.ts");
    const roleDefaults = read("src/lib/agent-constants.ts");
    expect(voiceRuntime).toContain("runtimeTemplate.rolePersonality");
    expect(voiceRuntime).toContain("input.personality");
    // The one-Bot baseline carries the same two personal guarantees the retired
    // personal-assistant role used to: protect the principal's time, and keep
    // their details confidential.
    expect(roleDefaults).toContain("protect the principal's time");
    expect(roleDefaults).toContain("as confidential unless the task plainly requires it");
  });

  it("keeps personal and business tool defaults scoped while explicit selections stay authoritative", () => {
    const personalTools = resolveCreateEnabledTools(false);
    const businessTools = resolveCreateEnabledTools(true);
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
    expect(businessTools).toContain("create_followup_task");
    expect(businessTools).toContain("send_contract");
    expect(personalTools).toContain("book_appointment");
    expect(personalTools).toContain("send_text_message");

    const selected = ["send_email", "book_appointment"] as const;
    expect(applyPlanToolUnlocks(selected, "enterprise")).toEqual(selected);
    expect(resolveAgentTools(selected)).toEqual(selected);
    expect(resolveAgentTools(null)).toEqual(getDefaultAgentTools());

    // A personal account still never gets the business-only channels.
    for (const businessOnly of ["send_slack_notification", "send_teams_message", "send_contract"]) {
      expect(personalTools).not.toContain(businessOnly);
    }
  });

  it("keeps every create path on the one-Bot defaults instead of a role", () => {
    const mobile = read("src/routes/mobile-routes.ts");
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    const dialog = read("src/components/CreateAgentDialog.tsx");

    expect(DEFAULT_BOT_ARCHETYPE).toBe("All-Purpose Bot");
    expect(existsSync(resolve(root, "src/components/AgentTemplates.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/pages/TemplatesPage.tsx"))).toBe(false);

    for (const [path, source] of [
      ["mobile-routes.ts", mobile],
      ["agent-routes-v2.ts", agentRoutes],
    ] as const) {
      expect(source, path).toContain("resolveCreateEnabledTools(isBusinessAgent)");
      expect(source, path).toContain("resolveCreatePersonality");
      expect(source, path).toContain("archetype: DEFAULT_BOT_ARCHETYPE");
      // No create path may narrow the toolbox by role, or re-add a /roles menu.
      expect(source, path).not.toContain("getRoleToolSet");
      expect(source, path).not.toMatch(/"\/roles"/);
    }

    expect(dialog).not.toContain("accountType");
    expect(dialog).toContain(
      'Configurable channels: ${BOT_CHANNELS.filter((channel) => channel.key !== "text")',
    );
    expect(dialog).toContain('workspace_model: "one_workspace"');
    expect(dialog).not.toMatch(/setPosture|rolesForPosture|Choose one personal job/);
    expect(dialog).not.toMatch(/TECHNICAL_ROLE_BY_TEMPLATE|Start from a role/);
  });

  it("keeps one roster while preserving legacy seed flags for safe migrations", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const shell = read("src/components/WorkspaceShell.tsx");
    const routes = read("src/routes/AppRoutes.tsx");
    const founderSeed = read("src/lib/founder-fleet-seed.ts");

    expect(routes).toContain('path="/overview" element={<ToStudioRedirect />}');
    expect(shell).toContain("<BotMark");
    expect(shell).toContain("seed={agent.id}");
    expect(shell).not.toMatch(/personalAgents|businessAgents|founderPair|posture=/);
    expect(studio).not.toContain("useAccount");
    expect(studio).not.toContain("posture=");
    expect(founderSeed).toContain("isBusinessAgent: false");
    expect(founderSeed).toContain("isBusinessAgent:");
  });

  it("keeps Stripe launch-status verification deep instead of reducing it to a catalog presence check", () => {
    const grace = read("src/lib/voice-completion-grace.ts");
    const continuity = read("tests/live-call-billing-continuity-contract.test.ts");
    const script = [
      read("scripts/generate-launch-status.mjs"),
      read("scripts/lib/stripe-launch-readiness.mjs"),
    ].join("\n");
    const manifest = read("scripts/lib/stripe-founder-catalog.mjs");

    expect(grace).toContain("temporary negative Runtime Balance");
    expect(continuity).toContain("temporary negative Runtime Balance");
    expect(continuity).not.toContain("temporary negative Conversation Balance");
    expect(manifest).toContain("PUBLIC_SELF_SERVE_PLAN_IDS = CHANNEL_OFFERS.map");
    expect(script).toContain("FOUNDER_PRICES");
    expect(script).toContain("FOUNDER_CATALOG_VERSION");
    expect(script).toContain("PUBLIC_SELF_SERVE_PLAN_IDS");
    expect(script).toContain("publicCatalogPrices.length > 0");
    expect(script).toContain("actual.metadata?.wireline_catalog_version");
    expect(script).toContain("actual.metadata?.wireline_price_key");
    expect(script).toContain('catalogParams.append("expand[]", "data.product")');
    expect(script).toContain("product_name_mismatch");
    expect(script).toContain("product_catalog_version_mismatch");
    expect(script).toContain("supportEmail === STRIPE_PUBLIC_SUPPORT_EMAIL");
    expect(script).toContain("brandingPrimaryColor === STRIPE_BRAND_PRIMARY_COLOR");
    expect(script).toContain("brandingSecondaryColor === STRIPE_BRAND_SECONDARY_COLOR");
    expect(script).toContain("managed_configuration_missing");
    expect(script).toContain("features?.subscription_update?.enabled === false");
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

    expect(routes).toContain(
      "Upload a text, PDF, DOCX, or XLSX document, or a PNG, JPG, WEBP, or GIF image.",
    );
    expect(routes).toContain("capabilities: { image_uploads: isTrainingImageAvailable() }");
    expect(kb).toContain("config?.capabilities?.image_uploads === true");
    expect(kb).toMatch(
      /accept=\{\s*imageUploadsAvailable\s*\?\s*"\.txt,\.csv,\.md,\.markdown,\.pdf,\.docx,\.xlsx,image\/png,image\/jpeg,image\/jpg,image\/webp,image\/gif"\s*:\s*"\.txt,\.csv,\.md,\.markdown,\.pdf,\.docx,\.xlsx"/,
    );
    expect(kb).toContain(
      "Text, Markdown, CSV, PDF, DOCX, or XLSX files, or PNG, JPG, WEBP, or GIF images",
    );
    expect(kb).toContain(
      "Image uploads are unavailable. Upload TXT, MD, CSV, PDF, DOCX, or XLSX files.",
    );
    expect(kb).toContain("readAsset(file, imageUploadsAvailable)");
    expect(kb).not.toContain("PDF, DOCX, TXT, CSV");
    expect(kb).toContain("document type that does not match its extension");
    expect(kb).toContain("Knowledge could not be loaded.");
    expect(checklist).toContain("getIntegrationChecklistStatus(intRes)");
    // The owner's checklist tracks their own registry subscription, never
    // platform engineering controls.
    expect(checklist).toContain('registryState === "active" || registryState === "pending_link"');
    expect(checklist).not.toMatch(/Row-level security|audit log enabled|SOC 2/i);
    // National screening is said only for the calls it runs on, as the Terms
    // say it: campaigns and automated sales wait for it, and a one-at-a-time
    // sales call goes out on the owner's confirmation.
    expect(security).toMatch(
      /Before an outgoing call BotBound checks the account's block list and the calling hours where the recipient is\./i,
    );
    expect(security).toContain(
      "Campaigns, imported lists, and automated sales sequences wait until screening against the national do-not-call list is connected.",
    );
    expect(security).toContain(
      "One-at-a-time sales calls and texts go out after you confirm you are responsible for permission and Do Not Call rules, and are checked against that list once you connect your registry account.",
    );
    expect(security).not.toMatch(/Sales calls are also screened against the national/i);
    expect(security).not.toMatch(/screens the national do-not-call list, the account block list/i);
    expect(security).not.toContain("Live outbound dialing is gated");
    expect(security).not.toContain("DNCScrub");
    expect(security).not.toContain("FEDERAL_DNC_API_KEY");
    // Screening configuration must not be presented as permission to place a call.
    expect(compliance).toContain("Campaign Screening");
    expect(compliance).toContain("summary.federal_dnc_configured === true");
    expect(compliance).not.toContain("You don't register anything.");
    expect(compliance).not.toContain("Screening setup needed");
    expect(compliance).not.toContain("DNCScrub");
  });

  it("keeps contact and support fallbacks limited to transport or service failures", () => {
    const contact = read("src/components/ContactPage.tsx");
    const support = read("src/components/SupportPage.tsx");
    for (const source of [contact, support]) {
      expect(source).toContain("responseStatus = response.status");
      expect(source).toContain("responseStatus !== null && responseStatus >= 500");
      expect(source).toContain("mailto:support@botbound.app");
      expect(source).not.toContain("support@trywireline.com");
      expect(source).toContain("setError(message)");
      expect(source).toContain("isTransport");
      expect(source).toContain("if (isTransport)");
      expect(source).toContain("} else {\n        setError(message);");
    }
    expect(read("src/components/AdminSettings.tsx")).toContain(
      '<Navigate to="/settings/team" replace />',
    );
    expect(read("src/pages/TeamSettings.tsx")).toContain('setTeamAccess("error")');
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
