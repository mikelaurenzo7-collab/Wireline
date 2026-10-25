import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { encodeVoiceRecording } from "../src/components/voice/voice-clone-recording";
import {
  LIVE_VOICE_COACHING_COPY,
  LIVE_VOICE_MAX_SECONDS,
  LIVE_VOICE_MIN_SECONDS,
  LIVE_VOICE_SCRIPT,
  analyzeLiveVoiceRecording,
  readPcm16MonoWav,
} from "../src/lib/voice/live-voice-quality";
import {
  OpenAISipTurnTiming,
  XAI_TURN_AUDIO_START_EVENTS,
} from "../src/lib/voice/openai-sip-turn-timing";
import {
  XAICustomVoiceError,
  classifyXAICustomVoiceFailure,
  isXAICustomVoiceId,
  synthesizeXAIVoiceLine,
} from "../src/lib/voice/xai-custom-voice-client";
import {
  LIVE_VOICE_BY_GENDER,
  resolveCustomVoiceLatencyBudgetMs,
  stockFallbackVoiceFor,
  xaiVoiceSwapUpdate,
} from "../src/lib/voice/xai-voice-config";

const RATE = 24_000;

/** Speech-like signal: a voiced tone with short natural pauses and faint room noise. */
function speech(seconds: number, amplitude = 0.3, { pauses = true, noise = 0.0005 } = {}) {
  const samples = new Float32Array(Math.round(seconds * RATE));
  let seed = 7;
  for (let index = 0; index < samples.length; index++) {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    const t = index / RATE;
    const talking = !pauses || t % 2 < 1.7;
    const hiss = (seed / 0x7fffffff - 0.5) * 2 * noise;
    samples[index] = (talking ? amplitude * Math.sin(2 * Math.PI * 180 * t) : 0) + hiss;
  }
  return samples;
}

describe("live voice quality check", () => {
  it("passes a clean, well-paced 90 second read", () => {
    const report = analyzeLiveVoiceRecording(speech(90), RATE);
    expect(report.verdict).toBe("great");
    expect(report.tips).toEqual([]);
    expect(report.durationSeconds).toBe(90);
  });

  it("coaches instead of accepting a clip that is too short or too quiet", () => {
    const short = analyzeLiveVoiceRecording(speech(5), RATE);
    expect(short.verdict).toBe("retake");
    expect(short.tips).toContain("too_short");
    const quiet = analyzeLiveVoiceRecording(speech(60, 0.003), RATE);
    expect(quiet.tips).toContain("too_quiet");
  });

  it("flags clipping and long silences", () => {
    const hot = analyzeLiveVoiceRecording(speech(60, 1.4), RATE);
    expect(hot.tips).toContain("clipping");
    const silent = speech(60);
    silent.fill(0, RATE * 5);
    expect(analyzeLiveVoiceRecording(silent, RATE).tips).toContain("long_silences");
  });

  it("round-trips the browser encoder through the server WAV reader", () => {
    const wav = encodeVoiceRecording([speech(24)], 48_000, {
      minSeconds: LIVE_VOICE_MIN_SECONDS,
      maxSeconds: LIVE_VOICE_MAX_SECONDS,
    });
    const decoded = readPcm16MonoWav(wav);
    expect(decoded.sampleRateHz).toBe(RATE);
    expect(() => readPcm16MonoWav(new Uint8Array(40))).toThrow("invalid_wav");
  });

  it("keeps the legacy 6-20 second bounds by default", () => {
    expect(() => encodeVoiceRecording([speech(30)], RATE)).toThrow(
      "Record between 6 and 20 seconds of your own voice.",
    );
  });

  it("has a vendor-neutral script and coaching copy", () => {
    const copy = [...LIVE_VOICE_SCRIPT, ...Object.values(LIVE_VOICE_COACHING_COPY)].join(" ");
    expect(LIVE_VOICE_SCRIPT.length).toBeGreaterThanOrEqual(6);
    expect(copy).not.toMatch(/grok|xai|x\.ai|openai|slower/i);
  });
});

describe("stock fallback voice", () => {
  it("prefers the clone's voice type, then the saved voice", () => {
    expect(LIVE_VOICE_BY_GENDER).toEqual({ female: "ara", male: "rex" });
    expect(stockFallbackVoiceFor("marin", "male")).toBe("rex");
    expect(stockFallbackVoiceFor("cedar", "female")).toBe("ara");
    expect(stockFallbackVoiceFor("rex", null)).toBe("rex");
  });

  it("swaps only the voice mid-call", () => {
    expect(xaiVoiceSwapUpdate("rex")).toEqual({
      type: "session.update",
      session: { voice: "rex" },
    });
  });

  it("uses a sane latency budget", () => {
    expect(resolveCustomVoiceLatencyBudgetMs({})).toBe(2_500);
    expect(
      resolveCustomVoiceLatencyBudgetMs({ WIRELINE_CUSTOM_VOICE_LATENCY_BUDGET_MS: "4000" }),
    ).toBe(4_000);
  });

  it("falls back silently on provider errors or two slow replies, never hanging up", () => {
    const source = readFileSync("src/lib/voice/openai-sip-session.ts", "utf8");
    expect(source).toContain('if (slowCustomVoiceReplies >= 2) fallBackToStockVoice("latency")');
    expect(source).toContain('fallBackToStockVoice("provider_error")');
    expect(source).toContain("stockFallbackVoiceFor(runtime.voice, runtime.customVoice?.gender)");
    expect(source).toContain("Cloned voice switched to stock voice mid-call");
  });
});

describe("per-call time to first audio", () => {
  it("measures from sideband open to the first xAI audio chunk", () => {
    const timing = new OpenAISipTurnTiming({ audioStartEvents: XAI_TURN_AUDIO_START_EVENTS });
    timing.markConnected(1_000);
    timing.observe({ type: "response.output_audio.delta" }, 1_850);
    timing.observe({ type: "response.output_audio.delta" }, 2_500);
    expect(timing.summary().firstAudioMs).toBe(850);
  });
});

describe("custom voice client", () => {
  it("maps provider failures to kind, stable codes", () => {
    expect(classifyXAICustomVoiceFailure(403, "Enterprise only")).toBe("not_entitled");
    expect(classifyXAICustomVoiceFailure(403, "Not available in Illinois")).toBe(
      "region_unavailable",
    );
    expect(classifyXAICustomVoiceFailure(429, "")).toBe("limit_reached");
    expect(classifyXAICustomVoiceFailure(422, "bad audio")).toBe("rejected_audio");
    expect(classifyXAICustomVoiceFailure(503, "")).toBe("provider_unavailable");
  });

  it("only accepts opaque voice ids", () => {
    expect(isXAICustomVoiceId("vx_abc123")).toBe(true);
    expect(isXAICustomVoiceId("../etc")).toBe(false);
    expect(isXAICustomVoiceId(42)).toBe(false);
  });

  it("returns preview audio and reports failures", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    try {
      const ok = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      const audio = await synthesizeXAIVoiceLine("vx_abc123", "Hello", ok as never);
      expect(audio.length).toBe(3);
      const body = JSON.parse(
        String(
          (ok.mock.calls[0] as unknown[])[1] &&
            ((ok.mock.calls[0] as unknown[])[1] as { body: string }).body,
        ),
      );
      expect(body.voice_id).toBe("vx_abc123");
      const fail = vi.fn(
        async () => new Response(JSON.stringify({ error: "nope" }), { status: 403 }),
      );
      await expect(synthesizeXAIVoiceLine("vx_abc123", "Hi", fail as never)).rejects.toBeInstanceOf(
        XAICustomVoiceError,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("clone studio copy", () => {
  const studio = readFileSync("src/components/voice/LiveVoiceCloneStudio.tsx", "utf8");
  const strings = (studio.match(/"[^"\n]*"|`[^`\n]*`|>[^<>{}\n]+</g) ?? []).join(" ");

  it("never names the vendor or calls the clone slower", () => {
    expect(strings).not.toMatch(/grok|xai|x\.ai|openai|elevenlabs|slower|latency/i);
  });

  it("shows one neutral, dismissible tip and the premium flow pieces", () => {
    expect(studio).toContain(
      "Tip: you can switch any Bot back to a stock voice in one tap, anytime.",
    );
    expect(studio).toContain("localStorage");
    for (const piece of [
      'role="meter"',
      "Retake",
      "Use Built-In Voice",
      "Use Voice",
      "<TestCallLink",
      '"Built-In Voice"',
      'aria-live="polite"',
      "LIVE_VOICE_SCRIPT",
    ])
      expect(studio).toContain(piece);
  });
});

describe("clone discoverability and stock voice undo", () => {
  const studio = readFileSync("src/components/voice/LiveVoiceCloneStudio.tsx", "utf8");
  const picker = readFileSync("src/components/voice/SimpleVoicePicker.tsx", "utf8");
  const routes = readFileSync("src/routes/AppRoutes.tsx", "utf8");
  const panel = readFileSync("src/components/StudioAgentWorkspacePanel.tsx", "utf8");

  it("keeps a visible entry even when cloning is not on for the account", () => {
    expect(studio).not.toContain("if (loading || !capabilities?.available) return null;");
    expect(studio).toContain("Voice cloning isn't on for this account yet.");
    expect(studio).toContain('LIVE_VOICE_ANCHOR_ID = "voice-clone"');
  });

  it("links the picker and short routes to the clone studio", () => {
    expect(picker).toContain("Clone Voice");
    expect(picker).toContain("LIVE_VOICE_ANCHOR_ID");
    for (const path of ['path="/voice"', 'path="/voices"', 'path="/voice-clone"'])
      expect(routes).toContain(path);
    expect(routes).toContain('search.set("section", "setup")');
    expect(panel).toContain('id="voice"');
  });

  it("confirms a stock voice pick and offers one-tap undo", () => {
    expect(picker).toContain("Saved. ${shortName} answers ${agentName}'s next call.");
    expect(picker).toContain("selectVoice(undoVoice, { undo: true })");
    expect(picker).not.toContain("Saves automatically");
  });
});

describe("clone script stays channel-neutral", () => {
  it("never promises a text message (SMS is not launching)", () => {
    const quality = readFileSync("src/lib/voice/live-voice-quality.ts", "utf8");
    expect(quality).not.toMatch(/text confirmation|\bSMS\b/i);
    expect(quality).toContain("You'll get a confirmation shortly.");
    expect(LIVE_VOICE_SCRIPT.join(" ")).not.toMatch(/\btext(s|ing|ed)?\b|\bSMS\b/i);
  });
});
