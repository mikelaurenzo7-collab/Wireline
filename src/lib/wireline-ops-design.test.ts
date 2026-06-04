import { describe, it, expect } from "vitest";
import {
  WL_OPS_CLASSES,
  OPS_SENTIMENT_COLORS,
  OPS_COPY,
  OPS_PULSE_METRICS,
  OPS_CHANNEL_EMPTY,
} from "./wireline-ops-design";
import { WIRELINE_DIRECTOR_BRAND } from "./wireline-director-design";
import { BRAND } from "../constants/brand-colors";

describe("Wireline Live Ops design contract", () => {
  it("exposes stable CSS class hooks for ops surfaces", () => {
    expect(WL_OPS_CLASSES.canvas).toBe("wl-ops-canvas");
    expect(WL_OPS_CLASSES.callCard).toContain("wl-ops-call-card");
    expect(WL_OPS_CLASSES.callCardEscalated).toContain("--escalated");
    expect(WL_OPS_CLASSES.setupNudge).toBe("wl-setup-nudge");
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
    expect(OPS_COPY.floorTitle(0)).toMatch(/no live/i);
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
});
