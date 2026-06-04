/**
 * Locks the public showcase phone catalog — the source of truth for Vapi sync,
 * landing CTAs, and /help. Catches duplicate numbers, missing voices, and
 * landing-page drift without brittle UI snapshots.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_SHOWCASE_CONTACT_AGENTS,
  LANDING_PUBLIC_DEMO_AGENTS,
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "./contact-agents";

const ALL_SHOWCASE_AGENTS: ContactAgent[] = ALL_SHOWCASE_CONTACT_AGENTS;

const E164 = /^\+[1-9]\d{6,14}$/;

describe("showcase agent catalog", () => {
  it("ships 2 Wireline employees and 7 demo lines", () => {
    expect(WIRELINE_CONTACT_AGENTS.map((a) => a.name)).toEqual(["Sarah", "Liam"]);
    expect(WIRELINE_DEMO_AGENTS).toHaveLength(7);
  });

  it("every line uses a unique E.164 tel", () => {
    const tels = ALL_SHOWCASE_AGENTS.map((a) => a.tel);
    expect(new Set(tels).size).toBe(tels.length);
    for (const tel of tels) {
      expect(tel).toMatch(E164);
    }
  });

  it("every agent has a pinned ElevenLabs voiceId for sync", () => {
    for (const agent of ALL_SHOWCASE_AGENTS) {
      expect(agent.voiceId, `${agent.name} missing voiceId`).toMatch(/^[A-Za-z0-9]{20,}$/);
    }
  });

  it("demo agents use distinct voices (no two demos sound identical)", () => {
    const voiceIds = WIRELINE_DEMO_AGENTS.map((a) => a.voiceId);
    expect(new Set(voiceIds).size).toBe(voiceIds.length);
  });

  it("every public showcase line uses a unique voice (employees + demos)", () => {
    const voiceIds = ALL_SHOWCASE_CONTACT_AGENTS.map((a) => a.voiceId);
    expect(new Set(voiceIds).size).toBe(voiceIds.length);
  });

  it("every agent has a voiceLabel for marketing and sync logs", () => {
    for (const agent of ALL_SHOWCASE_CONTACT_AGENTS) {
      expect(agent.voiceLabel, `${agent.name} missing voiceLabel`).toMatch(/\S/);
    }
  });

  it("landing CTAs expose Jordan (inbound CS) and Jake (outbound sales) only", () => {
    expect(LANDING_PUBLIC_DEMO_AGENTS.map((a) => a.name)).toEqual(["Jordan", "Jake"]);
    expect(LANDING_PUBLIC_DEMO_AGENTS.every((a) => WIRELINE_DEMO_AGENTS.includes(a))).toBe(true);
  });

  it("demo lines never reuse employee numbers", () => {
    const employeeTels = new Set(WIRELINE_CONTACT_AGENTS.map((a) => a.tel));
    for (const demo of WIRELINE_DEMO_AGENTS) {
      expect(employeeTels.has(demo.tel)).toBe(false);
    }
  });

  it("Jordan and Jake first messages frame Wireline demos (not employee lines)", () => {
    const jordan = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jordan")!;
    const jake = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jake")!;
    expect(jordan.firstMessage).toMatch(/Wireline inbound demo/i);
    expect(jake.firstMessage).toMatch(/sales demo/i);
    expect(jordan.firstMessage).not.toMatch(/^Hi, thanks for calling Wireline — this is Sarah/);
  });
});
