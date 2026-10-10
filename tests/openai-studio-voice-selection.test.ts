import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  normalizeManagedOpenAIVoiceId,
  pickRotatedVoiceId,
  resolvePstnVoiceCandidate,
} from "../src/data/voice-roster";
import {
  OPENAI_REALTIME_VOICES as OPENAI_REALTIME_VOICE_OPTIONS,
  OPENAI_REALTIME_VOICE_IDS,
} from "../src/lib/voice-catalog";
import { resolveOpenAILiveVoiceSelection } from "../src/lib/voice/openai-live-agent-service";
import { resolveOpenAIAgentVoiceSelection } from "../src/lib/voice/openai-phone-agent-runtime";
import {
  OPENAI_REALTIME_VOICES,
  normalizeOpenAIRealtimeVoice,
} from "../src/lib/voice/openai-realtime-config";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("OpenAI Studio voice selection", () => {
  it("offers exactly the ten built-in Realtime voices from one shared id set", () => {
    const expected = [
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "sage",
      "shimmer",
      "verse",
      "marin",
      "cedar",
    ];

    expect(OPENAI_REALTIME_VOICE_IDS).toEqual(expected);
    expect(OPENAI_REALTIME_VOICES).toEqual(expected);
    expect(OPENAI_REALTIME_VOICE_OPTIONS.map((voice) => voice.id).sort()).toEqual(
      [...expected].sort(),
    );
    expect(OPENAI_REALTIME_VOICE_OPTIONS).toHaveLength(10);
    expect(OPENAI_REALTIME_VOICE_OPTIONS.every((voice) => voice.provider === "openai")).toBe(true);
  });

  it("rotates automatic Bot creation through all ten voices with Marin first", () => {
    const firstCycle = Array.from({ length: 10 }, (_, index) => pickRotatedVoiceId(index));

    expect(firstCycle[0]).toBe("marin");
    expect(firstCycle.sort()).toEqual([...OPENAI_REALTIME_VOICE_IDS].sort());
    expect(pickRotatedVoiceId(10)).toBe("marin");
    expect(pickRotatedVoiceId(Number.NaN)).toBe("marin");
  });

  it.each(OPENAI_REALTIME_VOICE_IDS)(
    "honors %s in both browser Studio and phone sessions",
    (voiceId) => {
      const studio = resolveOpenAILiveVoiceSelection({
        voiceProvider: "openai",
        voiceId,
        phoneVoiceId: null,
        role: "sales representative",
        businessVariables: { wirelineLiveVoiceProfile: "warm" },
      });
      const phone = resolveOpenAIAgentVoiceSelection({
        voiceProvider: "openai",
        voiceId,
        phoneVoiceId: null,
        profile: "warm",
      });

      expect(studio.voice).toBe(voiceId);
      expect(studio.source).toBe("agent_voice_id");
      expect(phone).toBe(voiceId);
      expect(normalizeManagedOpenAIVoiceId(` ${voiceId.toUpperCase()} `)).toBe(voiceId);
    },
  );

  it("uses the Bot's valid selected voice instead of its role profile", () => {
    const selection = resolveOpenAILiveVoiceSelection({
      voiceProvider: "openai",
      voiceId: " Shimmer ",
      phoneVoiceId: null,
      role: "sales representative",
      businessVariables: { wirelineLiveVoiceProfile: "warm" },
    });

    expect(selection).toEqual({
      profile: "warm",
      voice: "shimmer",
      source: "agent_voice_id",
    });
    expect(selection.voice).toBe(normalizeOpenAIRealtimeVoice("shimmer"));
  });

  it("falls back to the configured or role-derived profile only without a valid selection", () => {
    expect(
      resolveOpenAILiveVoiceSelection({
        voiceProvider: "openai",
        voiceId: "retired-provider-voice",
        phoneVoiceId: null,
        role: "sales representative",
        businessVariables: { wirelineLiveVoiceProfile: "warm" },
      }),
    ).toEqual({ profile: "warm", voice: "marin", source: "profile_fallback" });

    expect(
      resolveOpenAILiveVoiceSelection({
        voiceProvider: "openai",
        voiceId: null,
        phoneVoiceId: null,
        role: "sales representative",
        businessVariables: null,
      }),
    ).toEqual({ profile: "bright", voice: "coral", source: "profile_fallback" });
  });

  it("uses a presenter's persisted OpenAI phone voice for the browser preview too", () => {
    const studio = resolveOpenAILiveVoiceSelection({
      voiceProvider: "presenter",
      voiceId: "presenter-avatar-voice",
      phoneVoiceId: " Cedar ",
      role: "receptionist",
      businessVariables: { wirelineLiveVoiceProfile: "warm" },
    });
    const phone = resolveOpenAIAgentVoiceSelection({
      voiceProvider: "presenter",
      voiceId: "presenter-avatar-voice",
      phoneVoiceId: " Cedar ",
      profile: "warm",
    });

    expect(studio).toEqual({ profile: "warm", voice: "cedar", source: "agent_voice_id" });
    expect(phone).toBe("cedar");
    expect(resolvePstnVoiceCandidate(null, " Cedar ")).toBe("cedar");
  });

  it("uses the persisted OpenAI phone fallback for a retired studio provider", () => {
    const input = {
      voiceProvider: "11labs",
      voiceId: "retired-studio-voice",
      phoneVoiceId: "VERSE",
      role: "support",
      businessVariables: null,
    };

    expect(resolveOpenAILiveVoiceSelection(input).voice).toBe("verse");
    expect(
      resolveOpenAIAgentVoiceSelection({
        ...input,
        profile: "warm",
      }),
    ).toBe("verse");
  });

  it("loads the same persisted Bot voice field used by the phone runtime", () => {
    const studioRuntime = read("src/lib/voice/openai-live-agent-service.ts");
    const phoneRuntime = read("src/lib/voice/openai-phone-agent-runtime.ts");

    expect(studioRuntime).toContain("voiceId: schema.agents.voiceId");
    expect(studioRuntime).toContain("phoneVoiceId: schema.agents.phoneVoiceId");
    expect(studioRuntime).toContain("resolveOpenAILiveVoiceSelection(runtime.agent)");
    expect(phoneRuntime).toContain("voiceId: runtime.agent.voiceId");
    expect(phoneRuntime).toContain("resolveOpenAIAgentVoiceSelection");
  });

  it("passes the saved OpenAI voice, including a presenter's phone voice, to ChatGPT", () => {
    const drafts = read("src/lib/agent-draft-service.ts");
    const chatgpt = read("src/routes/chatgpt-mcp-account-routes.ts");

    expect(drafts).toContain("voiceProvider: schema.agents.voiceProvider");
    expect(drafts).toContain("phoneVoiceId: schema.agents.phoneVoiceId");
    expect(drafts).toContain('agent.voiceProvider?.trim().toLowerCase() === "presenter"');
    expect(drafts).toContain("resolvePstnVoiceCandidate(");
    expect(chatgpt).toContain("voice: draft.voiceId");
  });

  it("makes every voice write OpenAI-only while retaining legacy presenter reads", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");
    const deploy = read("src/components/DeployAgentModal.tsx");

    expect(routes).toContain('if (requestedProvider !== "openai")');
    expect(routes).toContain("const voiceId = normalizeManagedOpenAIVoiceId(requestedVoiceId)");
    expect(routes).toContain('voiceProvider: "openai"');
    expect(routes).toContain("phoneVoiceId: null");
    expect(routes).toContain("phoneVoiceProvider: null");
    expect(routes).not.toContain('new Set(["openai", "presenter"])');
    expect(routes).not.toContain('if (provider !== "presenter")');
    expect(picker).toContain("includedVoices.map(renderVoice)");
    expect(picker).toContain("Preview Voice");
    expect(picker).toContain("<OpenAILiveVoiceSandbox");
    expect(picker).toContain("Preview starts a private voice session.");
    expect(picker).toContain("key={`${selectedProvider}:${selectedVoiceId}`}");
    expect(picker).toContain(
      'const usesSeparatePhoneVoice = storedPrimaryProvider === "presenter"',
    );
    expect(picker).toContain('body: JSON.stringify({ voiceId: voice.id, provider: "openai" })');
    expect(picker).not.toContain('provider: "presenter"');
    expect(picker).not.toContain("primaryVoiceProvider");
    expect(review).toContain('config?.voice?.provider?.trim().toLowerCase() === "presenter"');
    expect(review).toContain("config.voice.phoneVoiceId");
    expect(deploy).toContain("allVoices.map");
    expect(deploy).not.toContain("allVoices.filter((v) => v.gender === gender)");
  });
});
