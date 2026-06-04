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
  DIRECTOR_LOADING_COPY,
  DIRECTOR_LIVE_STEP_COPY,
  LIVE_FEED_LABELS,
  directorPhaseCopy,
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
    expect(WL_DIRECTOR_CLASSES.directorBubble).toBe("wl-director-bubble");
    expect(WL_DIRECTOR_CLASSES.proposalCard).toBe("wl-proposal-card");
    expect(WL_DIRECTOR_CLASSES.orchestrationStep).toBe("wl-orchestration-step");
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

  it("starter prompts cover fleet, deploy, audit, deliverables, and research", () => {
    const ids = DIRECTOR_STARTER_PROMPTS.map((p) => p.id);
    expect(ids).toEqual([
      "first-agent",
      "sales-setup",
      "fleet-audit",
      "business-plan",
      "market-research",
    ]);
    expect(DIRECTOR_STARTER_PROMPTS.every((p) => p.label.length > 10)).toBe(true);
  });

  it("empty hero copy references wingman and fleet orchestration", () => {
    expect(DIRECTOR_EMPTY_HERO.titleAccent).toBe("business wingman");
    expect(DIRECTOR_EMPTY_HERO.subtitleWithFleet(2)).toContain("2 agents");
    expect(DIRECTOR_EMPTY_HERO.subtitleNoFleet.toLowerCase()).toContain("fleet");
    expect(DIRECTOR_EMPTY_HERO.capabilityEyebrow).toBeTruthy();
  });

  it("capability pills cover core Wireline channels", () => {
    const labels = DIRECTOR_CAPABILITY_PILLS.map((p) => p.label);
    expect(labels).toEqual(["Voice", "Email", "SMS", "CRM", "Integrations"]);
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
  });

  it("live feed labels distinguish scripted vs proposal modes", () => {
    expect(LIVE_FEED_LABELS.proposal).toBe("Proposed workflow");
    expect(LIVE_FEED_LABELS.proposalHint).toMatch(/approve/i);
  });
});
