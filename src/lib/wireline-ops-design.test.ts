import { describe, it, expect } from "vitest";
import {
  WL_OPS_CLASSES,
  OPS_SENTIMENT_COLORS,
  OPS_COPY,
  OPS_PULSE_METRICS,
  OPS_CHANNEL_EMPTY,
  OPS_TRAINING_PANEL,
  OPS_TRIAGE_EMPTY,
  OPS_TRIAGE_COPY,
  OPS_TRAINING_ASSISTS,
  OPS_STUDIO_ASSISTS,
  OPS_STUDIO_ASSISTS_COPY,
  directorAssistHref,
  directorPromptHref,
  OPS_HELP,
  OPS_SUPPORT_EMPTY,
  OPS_INSIGHTS_EMPTY,
  OPS_CHANNEL_TOOLBAR,
  OPS_AUDIT_SEVERITY,
  OPS_TRIAGE_ACCENTS,
  OPS_INSIGHTS_GROUPS,
  WL_CHANNEL_CLASSES,
  OPS_PIPELINE,
  WL_INTEGRATION_CLASSES,
  OPS_ADMIN,
  WL_ADMIN_CLASSES,
  OPS_FOUNDER,
  WL_FLEET_CLASSES,
  WL_STAT_CLASSES,
  WL_CHROME_CLASSES,
} from "./wireline-ops-design";
import { WIRELINE_DIRECTOR_BRAND } from "./wireline-director-design";
import { BRAND } from "../constants/brand-colors";

describe("Wireline Live Ops design contract", () => {
  it("exposes stable CSS class hooks for ops surfaces", () => {
    expect(WL_OPS_CLASSES.canvas).toBe("wl-ops-canvas");
    expect(WL_OPS_CLASSES.callCard).toContain("wl-ops-call-card");
    expect(WL_OPS_CLASSES.callCardEscalated).toContain("--escalated");
    expect(WL_OPS_CLASSES.setupNudge).toBe("wl-setup-nudge");
    expect(WL_OPS_CLASSES.filterChip).toBe("wl-ops-chip");
    expect(WL_OPS_CLASSES.dotSep).toBe("wl-dot-sep");
    expect(WL_OPS_CLASSES.divider).toBe("wl-ops-divider");
    expect(WL_OPS_CLASSES.insightLabel).toBe("wl-insight-label");
  });

  it("uses brand-aligned sentiment colors (signal for positive only)", () => {
    expect(OPS_SENTIMENT_COLORS.positive).toBe(WIRELINE_DIRECTOR_BRAND.signal);
    expect(OPS_SENTIMENT_COLORS.neutral).toBe(BRAND.purple);
    expect(OPS_SENTIMENT_COLORS.negative).toBe(BRAND.rose);
  });

  it("keeps operator-facing copy specific, not generic SaaS", () => {
    expect(OPS_COPY.intelHub.toLowerCase()).toContain("action");
    expect(OPS_COPY.floorQuiet.toLowerCase()).toContain("floor");
    expect(OPS_PULSE_METRICS.live.label.toLowerCase()).toContain("live");
  });

  it("formats floor title for zero and plural callers", () => {
    expect(OPS_COPY.floorTitle(0)).toMatch(/live floor/i);
    expect(OPS_COPY.floorTitle(1)).toContain("1 live caller");
    expect(OPS_COPY.floorTitle(3)).toContain("3 live callers");
  });

  it("defines channel empty states with cross-route CTAs", () => {
    expect(OPS_CHANNEL_EMPTY.phone.actions.some((a) => a.to.includes("outbound"))).toBe(true);
    expect(OPS_CHANNEL_EMPTY.sms.actions.some((a) => a.to.includes("outbound"))).toBe(true);
    expect(OPS_CHANNEL_EMPTY.email.actions.some((a) => a.to === "/integrations")).toBe(true);
    expect(OPS_CHANNEL_EMPTY.floor.actions.some((a) => a.to === "/chat")).toBe(true);
    expect(OPS_CHANNEL_EMPTY.training.actions.some((a) => a.to === "/agents")).toBe(true);
  });

  it("centralizes test call contact for analytics empty", () => {
    expect(OPS_COPY.testCallHref).toMatch(/^tel:/);
    expect(OPS_COPY.testCallNumber).toContain("630");
  });

  it("defines triage panel empty copy with route CTAs", () => {
    expect(OPS_TRIAGE_EMPTY.hotLeads.actions?.some((a) => a.to.includes("outbound"))).toBe(true);
    expect(OPS_TRIAGE_EMPTY.openTasks.actions?.some((a) => a.to.includes("intel"))).toBe(true);
  });

  it("defines the hot-lead strip and Director handoff contract", () => {
    expect(OPS_TRIAGE_COPY.hotStripLabel(1)).toBe("1 hot lead");
    expect(OPS_TRIAGE_COPY.hotStripLabel(3)).toBe("3 hot leads");
    expect(OPS_TRIAGE_COPY.hotStripHint.toLowerCase()).toContain("autonomous");
    expect(OPS_TRIAGE_COPY.hotStripPrompt(2).toLowerCase()).toContain("lead");
    expect(OPS_TRIAGE_COPY.escalationCoachPrompt("+1555", "summary")).toContain("+1555");
    expect(directorPromptHref("hi there")).toBe("/chat?prompt=hi%20there");
    expect(directorAssistHref("a/1", "go")).toBe("/chat?agent=a%2F1&prompt=go");
    expect(OPS_TRAINING_ASSISTS.length).toBeGreaterThanOrEqual(5);
    expect(OPS_TRAINING_ASSISTS.every((a) => a.label && a.prompt)).toBe(true);
  });

  it("defines the Studio co-pilot assists contract", () => {
    expect(OPS_STUDIO_ASSISTS.length).toBeGreaterThanOrEqual(5);
    expect(OPS_STUDIO_ASSISTS.every((a) => a.label && a.prompt)).toBe(true);
    expect(OPS_STUDIO_ASSISTS_COPY.eyebrow.toLowerCase()).toContain("director");
    expect(OPS_STUDIO_ASSISTS_COPY.hint.toLowerCase()).toContain("agent");
  });

  it("defines training panel nested empty copy", () => {
    expect(OPS_TRAINING_PANEL.knowledge.title.toLowerCase()).toContain("entries");
    expect(OPS_TRAINING_PANEL.rules.toLowerCase()).toContain("rules");
    expect(OPS_TRAINING_PANEL.directives.toLowerCase()).toContain("directives");
  });

  it("defines integrations and audit empty copy", () => {
    expect(OPS_CHANNEL_EMPTY.integrations.title.toLowerCase()).toContain("carrier");
    expect(OPS_CHANNEL_EMPTY.audit.actions.some((a) => a.to === "/agents")).toBe(true);
    expect(OPS_CHANNEL_EMPTY.campaigns.actions.some((a) => a.to.includes("outbound"))).toBe(true);
  });

  it("defines help, support, and insights empty copy with route CTAs", () => {
    expect(OPS_HELP.quickLinks.some((l) => l.to === "/chat")).toBe(true);
    expect(OPS_HELP.stat(3, 2)).toBe("3 live lines · 2 demos");
    expect(OPS_SUPPORT_EMPTY.dnc.title.toLowerCase()).toContain("blocked");
    expect(OPS_SUPPORT_EMPTY.auditCompliance.toLowerCase()).toContain("compliance");
    expect(OPS_INSIGHTS_EMPTY.funnel.actions?.some((a) => a.to.includes("outbound"))).toBe(true);
    expect(OPS_INSIGHTS_EMPTY.attribution.actions?.some((a) => a.to.includes("carrier"))).toBe(
      true,
    );
    expect(OPS_INSIGHTS_EMPTY.quality.description.toLowerCase()).toContain("score");
    expect(OPS_INSIGHTS_EMPTY.quality.actions.some((a) => a.to === "/phone")).toBe(true);
  });

  it("defines channel toolbar loading labels for route boundaries", () => {
    expect(OPS_CHANNEL_TOOLBAR.phone.loading.toLowerCase()).toContain("call");
    expect(OPS_CHANNEL_TOOLBAR.email.stat(1)).toBe("1 thread");
    expect(OPS_CHANNEL_TOOLBAR.sms.stat(3)).toBe("3 conversations");
    expect(OPS_CHANNEL_TOOLBAR.audit.loading.toLowerCase()).toContain("audit");
    expect(OPS_CHANNEL_TOOLBAR.audit.stat(1)).toBe("1 event");
    expect(OPS_CHANNEL_TOOLBAR.audit.stat(1200)).toBe("1,200 events");
    expect(OPS_AUDIT_SEVERITY.critical.label).toBe("Critical");
    expect(OPS_TRIAGE_ACCENTS.escalations).toBe(BRAND.rose);
    expect(OPS_INSIGHTS_GROUPS).toHaveLength(4);
    expect(OPS_INSIGHTS_GROUPS.some((g) => g.id === "reliability")).toBe(true);
    expect(OPS_INSIGHTS_EMPTY.reliability.title.toLowerCase()).toContain("reliability");
    expect(OPS_CHANNEL_TOOLBAR.triage.stat(4)).toBe("4 need attention");
    expect(OPS_CHANNEL_TOOLBAR.triage.stat(0)).toBe("All clear");
    expect(OPS_CHANNEL_TOOLBAR.insights.stat(30)).toBe("30-day window");
    expect(WL_CHANNEL_CLASSES.inboxGrid).toContain("wl-channel-inbox-grid");
    expect(OPS_CHANNEL_TOOLBAR.outbound.stat(2, 10)).toBe("2 queued · 10 leads");
    expect(OPS_CHANNEL_TOOLBAR.contact.stat(3)).toBe("3 events");
    expect(OPS_CHANNEL_TOOLBAR.fleet.agentsStat(2)).toBe("2 agents");
    expect(OPS_CHANNEL_TOOLBAR.integrations.stat(1)).toBe("1 carrier");
    expect(OPS_CHANNEL_TOOLBAR.dnc.stat(12)).toBe("12 blocked");
    expect(OPS_PIPELINE.emptyColumn.toLowerCase()).toContain("drop");
    expect(WL_INTEGRATION_CLASSES.previewCard).toBe("wl-integration-preview-card");
    expect(WL_INTEGRATION_CLASSES.liveCard).toBe("wl-integration-live-card");
    expect(OPS_ADMIN.tabLabels.branding).toBe("Branding");
    expect(OPS_ADMIN.saveLabels.growth).toBe("Save growth settings");
    expect(WL_ADMIN_CLASSES.panel).toBe("wl-admin-panel");
    expect(OPS_FOUNDER.stat(6)).toBe("6 staff agents");
    expect(WL_FLEET_CLASSES.agentRow).toBe("wl-fleet-agent-row touch-press");
    expect(WL_FLEET_CLASSES.agentRowList).toBe("wl-fleet-agent-row--list");
    expect(WL_STAT_CLASSES.tileBrand).toContain("wl-stat-tile--brand");
    expect(WL_STAT_CLASSES.valueRose).toContain("wl-stat-tile__value--rose");
    expect(WL_CHROME_CLASSES.drawerSection).toBe("wl-drawer-section-label");
    expect(WL_CHROME_CLASSES.inverseHover).toContain("chrome-inverse-hover");
    expect(WL_CHROME_CLASSES.paper).toBe("chrome-paper");
  });
});
