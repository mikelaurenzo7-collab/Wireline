import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { includedPhoneSlotsForPlan } from "../src/lib/phone-line-entitlements";
import { resolveAgentEntitlement } from "../src/lib/agent-entitlements";
import { parseSignupIntent, recommendedPlanFromIntent } from "../src/lib/signup-intent";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("round-5 fine-tune verified fixes", () => {
  it("credits Extra Agent phone slots in entitlement math", () => {
    expect(includedPhoneSlotsForPlan("starter", 0)).toBe(1);
    expect(includedPhoneSlotsForPlan("starter", 2)).toBe(3);
    // Starter Plus ships 2 base slots (personal + business agent); one paid
    // Extra Agent add-on brings the total to 3.
    expect(includedPhoneSlotsForPlan("team", 1)).toBe(3);
  });

  it("honors admin maxAgents when higher than catalog + extras on an active workspace", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus: "active",
      planId: "starter",
      extraAgents: 0,
      maxAgents: 4,
    });
    expect(entitlement.effectiveCap).toBe(4);
  });

  it("accepts the Solutions support wedge and recommends Starter", () => {
    const intent = parseSignupIntent("?wedge=support");
    expect(intent?.signupWedge).toBe("support");
    expect(recommendedPlanFromIntent(intent)).toBe("starter");
  });

  it("retires live-video session mint and keeps sample behind auth", () => {
    const routes = read("src/routes/video-presenter-routes-base.ts");
    const sessionIdx = routes.indexOf("/api/agents/:id/video-presenter/session");
    const sampleIdx = routes.indexOf("/api/agents/:id/video-presenter/sample");
    expect(sessionIdx).toBeGreaterThan(-1);
    expect(sampleIdx).toBeGreaterThan(-1);
    expect(routes.slice(sessionIdx, sampleIdx)).toContain("throwLiveVideoRetired");
    const retiredSample = routes.slice(sampleIdx);
    expect(retiredSample).toContain("authenticateUser");
    expect(retiredSample).toContain('code: "LIVE_VIDEO_SAMPLE_RETIRED"');
    expect(retiredSample).toContain("res.status(410).json");
    expect(retiredSample).not.toContain("mintLiveAvatarLiteSessionToken");
  });

  it("clears live-video provider opt-in when the add-on subscription ends", () => {
    const billing = read("src/routes/billing-routes.ts");
    expect(billing).toContain('videoPresenterProvider: "synthetic"');
    expect(billing).toContain("live_video_addon");
  });

  it("gates live-call SMS through the shared outbound dial gate", () => {
    const handlers = read("src/routes/vapi/tool-handlers-core.ts");
    expect(handlers).toContain("evaluateOutboundDialGate");
    // The live-session exemptions (skip quiet hours/duplicates, supply
    // consent) only apply when the destination IS the live caller — a
    // model-supplied third-party to_number must clear the full gate.
    expect(handlers).toContain(
      "const isLiveCounterpart = Boolean(liveCallerNumber) && targetNumber === liveCallerNumber",
    );
    expect(handlers).toContain("hasExpressWrittenConsent: isLiveCounterpart");
    expect(handlers).toContain("isLiveSessionFollowUp: isLiveCounterpart");
    expect(handlers).not.toContain("isLiveSessionFollowUp: true,");
    const gate = read("src/lib/outbound-dial-gate.ts");
    expect(gate).toContain("isLiveSessionFollowUp");
  });

  it("keeps Aurora fonts on shareable + MCP customer surfaces", () => {
    const shell = read("src/lib/shareable-artifact/template/shell.ts");
    const mcp = read("src/lib/wireline-mcp-widget-styles.ts");
    expect(shell).toContain("Inter Tight");
    expect(shell).toContain("IBM Plex Mono");
    expect(shell).not.toContain("Instrument Serif");
    expect(mcp).toContain("Inter Tight");
    expect(mcp).not.toContain("Instrument Serif");
  });

  it("does not patch a LiveAvatar SDK after talking-head retirement", () => {
    const pkg = read("package.json");
    expect(pkg).not.toContain("scripts/patch-liveavatar-sdk.mjs");
    expect(pkg).not.toContain("@heygen/liveavatar-web-sdk");
  });

  it("keeps privacy consent off Fast Start so Create stays tappable on mobile", () => {
    const consent = read("src/components/CookieConsent.tsx");
    expect(consent).toContain('get("create") === "1"');
    expect(consent).toContain("createFlowOpen");
    expect(consent).toContain("isAuthPortalPath(location.pathname) || createFlowOpen");
  });
});
