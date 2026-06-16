import { describe, it, expect } from "vitest";
import {
  WIRELINE_DIRECTOR_BRAND,
  WL_DIRECTOR_CLASSES,
  WL_APP_CLASSES,
  DIRECTOR_PHASE_COPY,
  DIRECTOR_STARTER_PROMPTS,
  DIRECTOR_SCENE_BADGES,
  DIRECTOR_EMPTY_HERO,
  DIRECTOR_CAPABILITY_PILLS,
  DIRECTOR_CAPABILITY_CATALOG,
  DIRECTOR_CAPABILITY_CATEGORY_LABELS,
  DIRECTOR_LOADING_COPY,
  DIRECTOR_LIVE_STEP_COPY,
  DIRECTOR_COMPOSER_HINTS,
  DIRECTOR_COMPOSER_ACCESSORY_HINTS,
  DIRECTOR_COMPOSER_CONTEXT,
  WIRELINE_DESIGN_UI,
  WIRELINE_STITCH_UI,
  LIVE_FEED_LABELS,
  DIRECTOR_TURN_LEDGER_COPY,
  DIRECTOR_SESSION_COPY,
  LIVE_ORCHESTRA_COPY,
  DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT,
  AGENT_WORKSPACE_STARTER_PROMPTS,
  directorPhaseCopy,
  directorCapabilitiesByCategory,
} from "./wireline-director-design";

describe("Wireline Director design contract", () => {
  it("uses Wireline brand violet as primary brand", () => {
    expect(WIRELINE_DIRECTOR_BRAND.violet).toBe("#8B3FD6");
    expect(WIRELINE_DIRECTOR_BRAND.violetDeep).toMatch(/^#/);
  });

  it("exposes stable CSS class hooks for mission control UI", () => {
    expect(WL_DIRECTOR_CLASSES.missionPanel).toContain("wl-mission-panel");
    expect(WL_DIRECTOR_CLASSES.missionPanel).not.toContain("grid");
    expect(WL_DIRECTOR_CLASSES.composerDock).toContain("wl-composer-dock");
    expect(WL_DIRECTOR_CLASSES.composerColumn).toContain("lg:max-w-5xl");
    expect(WL_DIRECTOR_CLASSES.directorBubble).toContain("wl-director-bubble");
    expect(WL_DIRECTOR_CLASSES.proposalCard).toContain("wl-proposal-card");
    expect(WL_DIRECTOR_CLASSES.orchestrationStep).toContain("wl-orchestration-step");
    expect(WL_DIRECTOR_CLASSES.threadColumn).toContain("wl-director-thread");
    expect(WL_DIRECTOR_CLASSES.messageStack).toContain("wl-director-message-stack");
    expect(WL_DIRECTOR_CLASSES.emptyHero).toContain("wl-director-empty-hero");
    expect(WL_DIRECTOR_CLASSES.fleetConstellation).toContain("wl-fleet-constellation");
    expect(WL_APP_CLASSES.proTitle).toContain("wl-pro-title");
    expect(WL_APP_CLASSES.proEyebrow).toContain("wl-pro-eyebrow");
    expect(WL_DIRECTOR_CLASSES.composerToolbar).toContain("wl-director-composer-toolbar");
    expect(WL_DIRECTOR_CLASSES.composerAccessory).toContain("wl-composer-accessory-panel");
    expect(WL_DIRECTOR_CLASSES.composerToolChip).toContain("wl-composer-tool-chip");
    expect(WL_DIRECTOR_CLASSES.assistantMessage).toContain("wl-director-message--assistant");
    expect(DIRECTOR_COMPOSER_ACCESSORY_HINTS.capabilities).toContain("prompt");
    expect(DIRECTOR_COMPOSER_CONTEXT.coachingPrefix).toBe("Coaching");
    expect(DIRECTOR_COMPOSER_CONTEXT.closePanelLabel).toContain("Close");
    expect(WL_DIRECTOR_CLASSES.composerSendRow).toContain("wl-composer-send-row");
    expect(WL_DIRECTOR_CLASSES.composerContextPill).toContain("wl-composer-context-pill");
    expect(WL_DIRECTOR_CLASSES.composerSendBtn).toContain("wl-composer-send-btn");
    expect(WL_DIRECTOR_CLASSES.scrollToBottom).toContain("wl-scroll-to-bottom-btn");
    expect(WL_DIRECTOR_CLASSES.liveOrchestra).toContain("wl-live-orchestra");
    expect(WL_DIRECTOR_CLASSES.microLabel).toContain("wl-director-micro");
    expect(WL_DIRECTOR_CLASSES.metaCaption).toContain("wl-director-meta");
    expect(WL_DIRECTOR_CLASSES.spotlightLabel).toContain("wl-director-spotlight-label");
  });

  it("exposes Turn Ledger stratum + mission log class hooks", () => {
    expect(WL_DIRECTOR_CLASSES.turnStratum).toContain("wl-turn-stratum");
    expect(WL_DIRECTOR_CLASSES.turnStratum).toContain("rounded-md");
    expect(WL_DIRECTOR_CLASSES.turnStratumDeep).toContain("border-l-2");
    expect(WL_DIRECTOR_CLASSES.turnSummaryStrip).toContain("wl-turn-summary-strip");
    expect(WL_DIRECTOR_CLASSES.turnSummaryChip).toContain("font-mono");
    expect(WL_DIRECTOR_CLASSES.actionLog).toContain("wl-turn-action-log");
    expect(WL_DIRECTOR_CLASSES.actionRowFailed).toContain("rose");
    expect(WL_DIRECTOR_CLASSES.actionDetail).toContain("font-mono");
  });

  it("Turn Ledger copy is specific and operator-facing", () => {
    expect(DIRECTOR_TURN_LEDGER_COPY.actionsEyebrow).toBe("Mission log");
    expect(DIRECTOR_TURN_LEDGER_COPY.summaryReasoned("4.2s")).toBe("Reasoned 4.2s");
    expect(DIRECTOR_TURN_LEDGER_COPY.summaryActions(1)).toBe("1 action");
    expect(DIRECTOR_TURN_LEDGER_COPY.summaryActions(3)).toBe("3 actions");
    expect(DIRECTOR_TURN_LEDGER_COPY.summarySources(2)).toBe("2 sources");
    expect(DIRECTOR_TURN_LEDGER_COPY.summaryProposals(1)).toBe("1 proposal");
    expect(DIRECTOR_TURN_LEDGER_COPY.actionKindLabels.research).toBe("Research");
    expect(DIRECTOR_TURN_LEDGER_COPY.actionKindLabels.retry).toBe("Recovery");
  });

  it("live orchestra copy stays operator-native", () => {
    expect(LIVE_ORCHESTRA_COPY.eyebrow.toLowerCase()).toContain("fleet");
    expect(LIVE_ORCHESTRA_COPY.clearedSummary(2)).toContain("2 actions");
  });

  it("exposes framed panel classes without aurora chrome", () => {
    expect(WL_APP_CLASSES.panelFrame).toContain("wl-panel-elevated");
    expect(WL_APP_CLASSES.panelFrame).not.toContain("aurora");
    expect(WL_APP_CLASSES.insightStatCard).toContain("wl-panel");
  });

  it("exposes authenticated status and modal surface hooks", () => {
    expect(WL_APP_CLASSES.statusSuccess).toContain("wl-status-success");
    expect(WL_APP_CLASSES.modalSurface).toContain("wl-modal-surface");
    expect(WL_APP_CLASSES.pulseLive).toContain("wl-pulse-live");
  });

  it("exposes app chrome toolbar utilities", () => {
    expect(WL_APP_CLASSES.chromeToolbar).toContain("wl-chrome-toolbar");
    expect(WL_APP_CLASSES.mobileContextBar).toContain("wl-mobile-context-bar");
    expect(WL_APP_CLASSES.pageContextAccent).toContain("wl-page-context-accent");
    expect(WL_APP_CLASSES.workspaceTitle).toContain("wl-workspace-title");
    expect(WL_APP_CLASSES.bodyCaption).toContain("wl-body-caption");
    expect(WL_APP_CLASSES.inlineEmpty).toContain("wl-inline-empty");
    expect(WL_APP_CLASSES.surfaceVelvet).toContain("velvet");
    expect(WL_APP_CLASSES.chromeInverseHover).toContain("chrome-inverse-hover");
  });

  it("exposes app settings panel classes without glass or aurora blobs", () => {
    expect(WL_APP_CLASSES.settingsPanel).toContain("wl-panel-elevated");
    expect(WL_APP_CLASSES.settingsPanel).not.toContain("glass");
    expect(WL_APP_CLASSES.settingsPanel).not.toContain("aurora");
  });

  it("phase copy stays Wireline-native (co-pilot / fleet, not generic chatbot)", () => {
    expect(DIRECTOR_PHASE_COPY.connecting.headline.toLowerCase()).toContain("coach");
    expect(DIRECTOR_PHASE_COPY.replying.headline.toLowerCase()).toContain("co-pilot");
    const coached = directorPhaseCopy({
      phase: "thinking",
      coachAgentName: "Ava",
    });
    expect(coached.headline).toContain("Ava");
    const deep = directorPhaseCopy({ phase: "thinking", isDeep: true });
    expect(deep.headline.toLowerCase()).toContain("fleet");
  });

  it("starter prompts cover fleet, deploy, audit, deliverables, research, and verticals", () => {
    const ids = DIRECTOR_STARTER_PROMPTS.map((p) => p.id);
    expect(ids).toContain("first-agent");
    expect(ids).toContain("fleet-audit");
    expect(ids).toContain("business-plan");
    expect(ids).toContain("market-research");
    expect(ids).toContain("collections");
    expect(ids).toContain("logo-brand");
    expect(DIRECTOR_STARTER_PROMPTS.length).toBeGreaterThanOrEqual(8);
    expect(DIRECTOR_STARTER_PROMPTS.every((p) => p.label.length > 10)).toBe(true);
  });

  it("empty hero copy references fleet orchestration", () => {
    expect(DIRECTOR_EMPTY_HERO.titleAccent).toBe("one console");
    expect(DIRECTOR_EMPTY_HERO.subtitleWithFleet(2)).toContain("2 agents");
    expect(DIRECTOR_EMPTY_HERO.subtitleNoFleet.toLowerCase()).toContain("fleet");
    expect(DIRECTOR_EMPTY_HERO.capabilityEyebrow).toBeTruthy();
    expect(DIRECTOR_EMPTY_HERO.starterEyebrow).toBe("Start here");
    expect(DIRECTOR_EMPTY_HERO.discoverEyebrow).toBeTruthy();
  });

  it("featured starter count keeps empty state scannable", () => {
    expect(DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT).toBeGreaterThanOrEqual(3);
    expect(DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT).toBeLessThan(DIRECTOR_STARTER_PROMPTS.length);
  });

  it("agent workspace starters cover coaching paths", () => {
    expect(AGENT_WORKSPACE_STARTER_PROMPTS.length).toBeGreaterThanOrEqual(3);
    expect(
      AGENT_WORKSPACE_STARTER_PROMPTS.some((p) => p.label.toLowerCase().includes("call")),
    ).toBe(true);
  });

  it("capability pills cover channels, documents, research, and creative", () => {
    const labels = DIRECTOR_CAPABILITY_PILLS.map((p) => p.label);
    expect(labels).toContain("Voice");
    expect(labels).toContain("Documents");
    expect(labels).toContain("Code");
    expect(labels).toContain("Research");
    expect(labels).toContain("Creative");
    expect(labels.length).toBeGreaterThanOrEqual(8);
  });

  it("capability catalog spans all operator-facing categories", () => {
    const grouped = directorCapabilitiesByCategory();
    for (const cat of Object.keys(DIRECTOR_CAPABILITY_CATEGORY_LABELS)) {
      expect(grouped[cat as keyof typeof grouped].length).toBeGreaterThan(0);
    }
    expect(DIRECTOR_CAPABILITY_CATALOG.length).toBeGreaterThanOrEqual(18);
    expect(DIRECTOR_CAPABILITY_CATALOG.every((c) => c.example.length > 8)).toBe(true);
  });

  it("loading copy stays fleet-coach native", () => {
    expect(DIRECTOR_LOADING_COPY.headline.toLowerCase()).toContain("coach");
    expect(DIRECTOR_LOADING_COPY.sub.toLowerCase()).toContain("fleet");
  });

  it("live step copy distinguishes coach vs fleet and integration states", () => {
    expect(DIRECTOR_LIVE_STEP_COPY.contextCoach("Mira")).toContain("Mira");
    expect(DIRECTOR_LIVE_STEP_COPY.integrationsOn.toLowerCase()).toContain("integration");
    expect(DIRECTOR_LIVE_STEP_COPY.executeTitle.toLowerCase()).toContain("approval");
  });

  it("scene badges stay on purple/cream palette", () => {
    for (const badge of Object.values(DIRECTOR_SCENE_BADGES)) {
      expect(badge.color).toMatch(/text-brand/);
      expect(badge.bg).toMatch(/brand/);
      expect(badge.bg).not.toMatch(/emerald|sky|fuchsia|blue/i);
    }
    expect(DIRECTOR_SCENE_BADGES.document.label).toBe("Deliverable");
    expect(DIRECTOR_SCENE_BADGES.code.label).toBe("Code");
  });

  it("live feed labels distinguish scripted vs proposal modes", () => {
    expect(LIVE_FEED_LABELS.proposal).toBe("Proposed workflow");
    expect(LIVE_FEED_LABELS.proposalHint).toMatch(/approve/i);
    expect(LIVE_FEED_LABELS.proposalCount(3)).toContain("3");
    expect(LIVE_FEED_LABELS.researchEyebrow).toMatch(/source/i);
  });

  it("session copy clarifies what clear thread keeps vs removes", () => {
    expect(DIRECTOR_SESSION_COPY.sessionHint).toMatch(/Applied agent settings persist/i);
    expect(DIRECTOR_SESSION_COPY.applySaved("Greeting")).toMatch(/safe to clear thread/i);
    expect(DIRECTOR_SESSION_COPY.pendingApprovals(2)).toContain("2");
  });

  it("degraded-load notice pairs with an inline retry affordance", () => {
    expect(DIRECTOR_SESSION_COPY.degradedNotice).toMatch(/could not be loaded/i);
    expect(DIRECTOR_SESSION_COPY.degradedNotice).not.toMatch(/refresh/i);
    expect(DIRECTOR_SESSION_COPY.degradedRetryLabel).toMatch(/retry/i);
  });

  it("composer hints rotate through capability areas", () => {
    expect(DIRECTOR_COMPOSER_HINTS.length).toBeGreaterThanOrEqual(4);
    expect(DIRECTOR_COMPOSER_HINTS.some((h) => h.toLowerCase().includes("research"))).toBe(true);
  });

  it("composer accessory hints cover every panel kind", () => {
    const kinds = [
      "connectors",
      "capabilities",
      "coach",
      "tools",
      "attach",
      "designSetup",
    ] as const;
    for (const kind of kinds) {
      expect(DIRECTOR_COMPOSER_ACCESSORY_HINTS[kind].length).toBeGreaterThan(8);
    }
    expect(Object.keys(DIRECTOR_COMPOSER_ACCESSORY_HINTS)).toHaveLength(kinds.length);
  });

  it("composer context copy includes send hint and toolbar label", () => {
    expect(DIRECTOR_COMPOSER_CONTEXT.sendHint).toMatch(/Enter/i);
    expect(DIRECTOR_COMPOSER_CONTEXT.toolbarLabel).toBeTruthy();
  });

  it("stitch UI copy is Wireline-branded without vendor marketing", () => {
    expect(WIRELINE_DESIGN_UI.designModeToggleLabel).toBe("Design");
    expect(WIRELINE_STITCH_UI).toBe(WIRELINE_DESIGN_UI);
    expect(WIRELINE_STITCH_UI.designModePlaceholder.length).toBeGreaterThan(20);
    expect(WIRELINE_STITCH_UI.badgeLabel).toBe("Wireline Design");
    expect(WIRELINE_STITCH_UI.deviceChromeLabel).not.toMatch(/google/i);
    expect(WIRELINE_STITCH_UI.loadingHint).toMatch(/3–5 minutes/);
    expect(WIRELINE_STITCH_UI.loadingHint).not.toMatch(/api key/i);
    expect(WIRELINE_STITCH_UI.failReply).toMatch(/couldn't finish/i);
    expect(WIRELINE_STITCH_UI.packagingPendingReply).toMatch(/packaging/i);
    expect(WIRELINE_STITCH_UI.chatFallbackReasoning).toMatch(/chat/i);
    expect(WIRELINE_STITCH_UI.loadingPhases.join(" ")).not.toMatch(/google/i);
    expect(WIRELINE_STITCH_UI.studioLoadingPhases.length).toBeGreaterThanOrEqual(4);
    expect(WIRELINE_STITCH_UI.studioLoadingPhases.join(" ")).toMatch(/Opus/i);
    expect(WIRELINE_STITCH_UI.studioLoadingPhases.join(" ")).toMatch(/Sonnet/i);
    expect(WIRELINE_STITCH_UI.studioLoadingHint).toMatch(/2–3 minutes/i);
    expect(WIRELINE_STITCH_UI.studioLoadingPhaseIntervalMs).toBeGreaterThanOrEqual(20_000);
    expect(WIRELINE_STITCH_UI.designStudioReasoning).toMatch(/Spectrum Desk/i);
    expect(WIRELINE_STITCH_UI.previewTeaserAction).toMatch(/preview/i);
    expect(WIRELINE_STITCH_UI.previewPageTitle).toBeTruthy();
  });

  it("exposes Code-view + expand contract for the preview studio", () => {
    expect(WIRELINE_STITCH_UI.codeTabLabel).toBe("Code");
    expect(WIRELINE_STITCH_UI.codeSourceFileName).toMatch(/\.html$/);
    expect(WIRELINE_STITCH_UI.copyCodeLabel).toMatch(/copy/i);
    expect(WIRELINE_STITCH_UI.copiedLabel).toMatch(/copied/i);
    expect(WIRELINE_STITCH_UI.codeErrorLabel).toMatch(/export/i);
    expect(WIRELINE_STITCH_UI.expandLabel).toMatch(/full screen/i);
  });
});
