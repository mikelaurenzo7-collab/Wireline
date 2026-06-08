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
  WIRELINE_STITCH_UI,
  LIVE_FEED_LABELS,
  DIRECTOR_SESSION_COPY,
  LIVE_ORCHESTRA_COPY,
  DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT,
  AGENT_WORKSPACE_STARTER_PROMPTS,
  directorPhaseCopy,
  directorCapabilitiesByCategory,
} from "./wireline-director-design";

describe("Wireline Director design contract", () => {
  it("uses Wireline aurora violet as primary brand", () => {
    expect(WIRELINE_DIRECTOR_BRAND.violet).toBe("#8B3FD6");
    expect(WIRELINE_DIRECTOR_BRAND.violetDeep).toMatch(/^#/);
  });

  it("exposes stable CSS class hooks for mission control UI", () => {
    expect(WL_DIRECTOR_CLASSES.missionPanel).toContain("wl-mission-panel");
    expect(WL_DIRECTOR_CLASSES.missionPanel).not.toContain("grid");
    expect(WL_DIRECTOR_CLASSES.composerDock).toContain("wl-composer-dock");
    expect(WL_DIRECTOR_CLASSES.composerColumn).toContain("lg:max-w-5xl");
    expect(WL_DIRECTOR_CLASSES.directorBubble).toBe("wl-director-bubble");
    expect(WL_DIRECTOR_CLASSES.proposalCard).toBe("wl-proposal-card");
    expect(WL_DIRECTOR_CLASSES.orchestrationStep).toBe("wl-orchestration-step");
    expect(WL_DIRECTOR_CLASSES.threadColumn).toBe("wl-director-thread");
    expect(WL_DIRECTOR_CLASSES.messageStack).toContain("wl-director-message-stack");
    expect(WL_DIRECTOR_CLASSES.emptyHero).toBe("wl-director-empty-hero");
    expect(WL_DIRECTOR_CLASSES.fleetConstellation).toBe("wl-fleet-constellation");
    expect(WL_APP_CLASSES.proTitle).toBe("wl-pro-title");
    expect(WL_APP_CLASSES.proEyebrow).toBe("wl-pro-eyebrow");
    expect(WL_DIRECTOR_CLASSES.composerToolbar).toBe("wl-director-composer-toolbar");
    expect(WL_DIRECTOR_CLASSES.composerAccessory).toBe("wl-composer-accessory-panel");
    expect(WL_DIRECTOR_CLASSES.composerToolChip).toBe("wl-composer-tool-chip");
    expect(WL_DIRECTOR_CLASSES.assistantMessage).toBe("wl-director-message--assistant");
    expect(DIRECTOR_COMPOSER_ACCESSORY_HINTS.capabilities).toContain("prompt");
    expect(DIRECTOR_COMPOSER_CONTEXT.coachingPrefix).toBe("Coaching");
    expect(DIRECTOR_COMPOSER_CONTEXT.closePanelLabel).toContain("Close");
    expect(WL_DIRECTOR_CLASSES.composerSendRow).toBe("wl-composer-send-row");
    expect(WL_DIRECTOR_CLASSES.composerContextPill).toBe("wl-composer-context-pill");
    expect(WL_DIRECTOR_CLASSES.composerSendBtn).toBe("wl-composer-send-btn");
    expect(WL_DIRECTOR_CLASSES.scrollToBottom).toBe("wl-scroll-to-bottom-btn");
    expect(WL_DIRECTOR_CLASSES.liveOrchestra).toBe("wl-live-orchestra");
    expect(WL_DIRECTOR_CLASSES.microLabel).toBe("wl-director-micro");
    expect(WL_DIRECTOR_CLASSES.metaCaption).toBe("wl-director-meta");
    expect(WL_DIRECTOR_CLASSES.spotlightLabel).toBe("wl-director-spotlight-label");
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
    expect(WL_APP_CLASSES.statusSuccess).toBe("wl-status-success");
    expect(WL_APP_CLASSES.modalSurface).toBe("wl-modal-surface");
    expect(WL_APP_CLASSES.pulseLive).toBe("wl-pulse-live");
  });

  it("exposes app chrome toolbar utilities", () => {
    expect(WL_APP_CLASSES.chromeToolbar).toBe("wl-chrome-toolbar");
    expect(WL_APP_CLASSES.mobileContextBar).toBe("wl-mobile-context-bar");
    expect(WL_APP_CLASSES.pageContextAccent).toBe("wl-page-context-accent");
    expect(WL_APP_CLASSES.workspaceTitle).toBe("wl-workspace-title");
    expect(WL_APP_CLASSES.bodyCaption).toBe("wl-body-caption");
    expect(WL_APP_CLASSES.inlineEmpty).toBe("wl-inline-empty");
    expect(WL_APP_CLASSES.surfaceVelvet).toContain("velvet");
    expect(WL_APP_CLASSES.chromeInverseHover).toContain("chrome-inverse-hover");
  });

  it("exposes app settings panel classes without glass or aurora blobs", () => {
    expect(WL_APP_CLASSES.settingsPanel).toContain("wl-panel-elevated");
    expect(WL_APP_CLASSES.settingsPanel).not.toContain("glass");
    expect(WL_APP_CLASSES.settingsPanel).not.toContain("aurora");
  });

  it("phase copy stays Wireline-native (wingman / fleet, not generic chatbot)", () => {
    expect(DIRECTOR_PHASE_COPY.connecting.headline.toLowerCase()).toContain("mission");
    expect(DIRECTOR_PHASE_COPY.replying.headline.toLowerCase()).toContain("wingman");
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

  it("loading copy stays mission-control native", () => {
    expect(DIRECTOR_LOADING_COPY.headline.toLowerCase()).toContain("mission");
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

  it("composer hints rotate through capability areas", () => {
    expect(DIRECTOR_COMPOSER_HINTS.length).toBeGreaterThanOrEqual(4);
    expect(DIRECTOR_COMPOSER_HINTS.some((h) => h.toLowerCase().includes("research"))).toBe(true);
  });

  it("composer accessory hints cover every panel kind", () => {
    const kinds = ["connectors", "capabilities", "coach", "tools", "attach"] as const;
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
    expect(WIRELINE_STITCH_UI.designModeToggleLabel).toBe("Design");
    expect(WIRELINE_STITCH_UI.designModePlaceholder.length).toBeGreaterThan(20);
    expect(WIRELINE_STITCH_UI.badgeLabel).toBe("Wireline Design");
    expect(WIRELINE_STITCH_UI.deviceChromeLabel).not.toMatch(/google/i);
    expect(WIRELINE_STITCH_UI.loadingHint).toMatch(/3–5 minutes/);
    expect(WIRELINE_STITCH_UI.loadingHint).not.toMatch(/api key/i);
    expect(WIRELINE_STITCH_UI.failReply).toMatch(/couldn't finish/i);
    expect(WIRELINE_STITCH_UI.packagingPendingReply).toMatch(/packaging/i);
    expect(WIRELINE_STITCH_UI.chatFallbackReasoning).toMatch(/chat/i);
    expect(WIRELINE_STITCH_UI.loadingPhases.join(" ")).not.toMatch(/google/i);
    expect(WIRELINE_STITCH_UI.studioLoadingPhases.length).toBeGreaterThanOrEqual(3);
    expect(WIRELINE_STITCH_UI.studioLoadingHint).toMatch(/about a minute/i);
    expect(WIRELINE_STITCH_UI.designStudioReasoning).toMatch(/Design Studio/i);
    expect(WIRELINE_STITCH_UI.previewTeaserAction).toMatch(/preview/i);
    expect(WIRELINE_STITCH_UI.previewPageTitle).toBeTruthy();
  });
});
