/**
 * showcase-assistant.test.ts
 * ----------------------------------------------------------------------
 * Locks down the boundary between the two kinds of public showcase
 * lines:
 *
 *   - "cs"   — the real Wireline employee lines (Sarah, Liam). These ARE
 *             Wireline's front-line team, so they may escalate to a human
 *             (the founder) and schedule callbacks.
 *   - "demo" — the vertical role-play demos on the landing page. These
 *             must NEVER page the founder or his employees. They keep the
 *             self-service conversion tools (signup / account / payment
 *             link) so they can still help a prospect directly, but no
 *             owner-routing tools.
 *
 * A silent edit that re-exposed escalate_to_human / schedule_callback on
 * a demo line would route landing-page calls into the founder's triage
 * inbox — exactly what this suite prevents.
 */
import { describe, expect, it } from "vitest";

import {
  buildShowcaseAssistantPayload,
  buildShowcaseFunctionTools,
  isOwnerRoutingShowcaseTool,
  showcaseToolNamesForKind,
} from "./showcase-assistant";
import { WIRELINE_CONTACT_AGENTS } from "../data/contact-agents";

describe("showcaseToolNamesForKind", () => {
  it("gives cs (employee) lines the full toolset including owner-routing tools", () => {
    const names = showcaseToolNamesForKind("cs");
    expect(names).toContain("escalate_to_human");
    expect(names).toContain("schedule_callback");
    // self-service conversion tools are always present
    expect(names).toContain("send_signup_link");
    expect(names).toContain("create_account");
    expect(names).toContain("send_payment_link");
  });

  it("strips owner-routing tools from demo lines but keeps self-service tools", () => {
    const names = showcaseToolNamesForKind("demo");
    expect(names).not.toContain("escalate_to_human");
    expect(names).not.toContain("schedule_callback");
    // demos can still send signup links / info and convert the caller
    expect(names).toContain("send_signup_link");
    expect(names).toContain("create_account");
    expect(names).toContain("send_payment_link");
  });
});

describe("buildShowcaseFunctionTools", () => {
  it("never emits owner-routing function tools for demo agents", () => {
    const toolNames = buildShowcaseFunctionTools("demo").map((t) => t.function.name);
    expect(toolNames).not.toContain("escalate_to_human");
    expect(toolNames).not.toContain("schedule_callback");
    expect(toolNames.length).toBeGreaterThan(0);
  });

  it("emits the escalation tool for cs agents", () => {
    const toolNames = buildShowcaseFunctionTools("cs").map((t) => t.function.name);
    expect(toolNames).toContain("escalate_to_human");
    expect(toolNames).toContain("schedule_callback");
  });
});

describe("isOwnerRoutingShowcaseTool", () => {
  it("flags the tools that page the founder", () => {
    expect(isOwnerRoutingShowcaseTool("escalate_to_human")).toBe(true);
    expect(isOwnerRoutingShowcaseTool("schedule_callback")).toBe(true);
  });

  it("flags legacy/internal tools that also route to the owner", () => {
    expect(isOwnerRoutingShowcaseTool("create_fleet_task")).toBe(true);
    expect(isOwnerRoutingShowcaseTool("capture_customer_profile")).toBe(true);
  });

  it("does not flag self-service or unknown tools", () => {
    expect(isOwnerRoutingShowcaseTool("send_signup_link")).toBe(false);
    expect(isOwnerRoutingShowcaseTool("create_account")).toBe(false);
    expect(isOwnerRoutingShowcaseTool("send_payment_link")).toBe(false);
    expect(isOwnerRoutingShowcaseTool("view_recent_interactions")).toBe(false);
    expect(isOwnerRoutingShowcaseTool("not_a_tool")).toBe(false);
  });
});

describe("buildShowcaseAssistantPayload — Flux transcriber", () => {
  const sarah = WIRELINE_CONTACT_AGENTS.find((a) => a.name === "Sarah")!;
  const liam = WIRELINE_CONTACT_AGENTS.find((a) => a.name === "Liam")!;

  it("Sarah uses Deepgram Flux EOT by default", () => {
    const payload = buildShowcaseAssistantPayload(sarah, "cs");
    expect(payload.transcriber.model).toBe("flux-general-en");
    expect(payload.startSpeakingPlan).not.toHaveProperty("smartEndpointingPlan");
    expect(payload.metadata.wireline_transcriber_mode).toBe("flux-eot");
  });

  it("Liam uses Deepgram Flux EOT by default", () => {
    const payload = buildShowcaseAssistantPayload(liam, "cs");
    expect(payload.transcriber.model).toBe("flux-general-en");
    expect(payload.transcriber.eotThreshold).toBe(0.62);
    expect(payload.startSpeakingPlan).not.toHaveProperty("smartEndpointingPlan");
    expect(payload.metadata.wireline_transcriber_mode).toBe("flux-eot");
  });

  it("Sarah uses Rachel voice with warmer ElevenLabs tuning", () => {
    const payload = buildShowcaseAssistantPayload(sarah, "cs");
    expect(payload.voice?.voiceId).toBe("21m00Tcm4TlvDq8ikWAM");
    expect(payload.voice?.stability).toBe(0.58);
    expect(payload.voice?.style).toBe(0.2);
    expect(payload.voice?.similarityBoost).toBe(0.9);
  });
});
