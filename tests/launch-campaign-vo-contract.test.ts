import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs build script, imported for its canonical copy.
import {
  assertBotBoundCampaignText,
  assertGeneratedMp3,
  campaignTrackFingerprint,
  campaignTrackFingerprintFromProvenance,
  CAMPAIGN_VO,
  DEFAULT_VOICE_ID,
  speakable,
} from "../scripts/generate-campaign-vo.mjs";
import { OPENAI_REALTIME_VOICE_IDS } from "../src/lib/voice-catalog";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The campaign document is the source of truth for voiceover copy; the
 * generator only renders it. These checks keep the two from drifting, which
 * would put a different script in the audio than the one the reels were
 * timecoded against.
 */
describe("launch campaign voiceover", () => {
  const campaign = read("docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md");
  const mediaKit = read("docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md");

  const tracks = CAMPAIGN_VO as Array<{
    id: string;
    file: string;
    targetSeconds: number;
    text: string;
  }>;

  it("renders exactly the audio deliverables the media kit lists", () => {
    for (const track of tracks) {
      expect(mediaKit, `${track.file} is not listed in the media kit`).toContain(track.file);
    }
    expect(tracks).toHaveLength(3);
  });

  it("excludes retired Live Video narration from the active launch set", () => {
    expect(tracks.map((track) => track.id)).not.toContain("live-video-25s");
    expect(tracks.map((track) => track.file)).not.toContain("wireline-live-video-25s.mp3");
  });

  it("keeps every voiceover verbatim from the campaign document", () => {
    for (const track of tracks) {
      expect(campaign, `${track.id} copy has drifted from the campaign document`).toContain(
        track.text,
      );
    }
  });

  it("fails closed on retired spoken branding and fingerprints reusable audio", () => {
    for (const track of tracks) {
      expect(track.text).not.toMatch(/\bWireline\b|trywireline\.com/i);
      expect(() => assertBotBoundCampaignText(track.text, track.id)).not.toThrow();
      expect(
        campaignTrackFingerprint({ track, engine: "openai", voiceId: DEFAULT_VOICE_ID }),
      ).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(() => assertBotBoundCampaignText("Welcome to Wireline.")).toThrow(
      "retired public branding",
    );

    const script = read("scripts/generate-campaign-vo.mjs");
    expect(script).toContain("audioProvenanceMatches(outputPath, fingerprint)");
    expect(script).toContain("writeAudioProvenance(outputPath, fingerprint, audio");
    expect(script).toContain("exists without a matching copy fingerprint");
  });

  it("preserves a custom voice only when its bound engine and track match", () => {
    const track = tracks[0];
    const customVoiceId = "custom-launch-voice";
    const expected = campaignTrackFingerprint({
      track,
      engine: "openai",
      voiceId: customVoiceId,
    });
    expect(
      campaignTrackFingerprintFromProvenance({
        track,
        expectedEngine: "openai",
        provenance: {
          track_id: track.id,
          engine: "openai",
          voice_id: customVoiceId,
        },
      }),
    ).toBe(expected);
    expect(() =>
      campaignTrackFingerprintFromProvenance({
        track,
        expectedEngine: "openai",
        provenance: {
          track_id: track.id,
          engine: "alternate",
          voice_id: customVoiceId,
        },
      }),
    ).toThrow("does not match its campaign track and engine");
  });

  it("rejects HTML, tiny bodies, and zero-frame audio before provenance is written", () => {
    const frameLength = 417;
    const valid = Buffer.alloc(frameLength * 3);
    for (let offset = 0; offset < valid.length; offset += frameLength) {
      valid.set([0xff, 0xfb, 0x90, 0x00], offset);
    }

    expect(assertGeneratedMp3(valid, "audio/mpeg; charset=binary")).toBeGreaterThan(0);
    expect(() => assertGeneratedMp3(valid, "text/html")).toThrow("not MP3 audio");
    expect(() => assertGeneratedMp3(Buffer.from("not audio"), "audio/mpeg")).toThrow(
      "implausibly small",
    );
    expect(() => assertGeneratedMp3(Buffer.alloc(2_048), "audio/mpeg")).toThrow(
      "no valid MP3 frames",
    );
  });

  it("follows the delivery guide when speaking the domain and prices", () => {
    // The guide: speak "botbound.app" as "bot bound dot app", and speak
    // prices as words, never digits.
    expect(speakable("Build free at botbound.app.")).toBe("Build free at bot bound dot app.");
    for (const track of tracks) {
      const spoken = speakable(track.text);
      expect(spoken).not.toMatch(/botbound\.app/i);
      expect(spoken).not.toMatch(/trywireline\.com/i);
      expect(spoken, `${track.id} speaks a numeric price`).not.toMatch(/\$\d/);
    }
  });

  it("sizes each script to its cut at the guide's speaking rate", () => {
    // The guide targets 2.3-2.5 words per second and says the scripts are
    // sized to leave air at the ends, so a script must never overrun its cut.
    for (const track of tracks) {
      const words = speakable(track.text).split(/\s+/).filter(Boolean).length;
      const fastestSeconds = words / 2.5;
      expect(
        fastestSeconds,
        `${track.id} cannot fit ${words} words into ${track.targetSeconds}s`,
      ).toBeLessThanOrEqual(track.targetSeconds);
    }
  });

  it("uses an OpenAI voice from the same fixed customer catalog", () => {
    expect(OPENAI_REALTIME_VOICE_IDS).toContain(DEFAULT_VOICE_ID);
    expect(mediaKit).toContain("default OpenAI TTS narration voice (`marin`)");
    expect(mediaKit).toContain("`gpt-4o-mini-tts`");
    expect(mediaKit).toContain("Alternate engines are rejected");

    const script = read("scripts/generate-campaign-vo.mjs");
    expect(script).toContain('endpoint: "https://api.openai.com/v1/audio/speech"');
    expect(script).toContain('const OPENAI_TTS_MODEL = "gpt-4o-mini-tts"');
    expect(script).toContain('const engine = engineIndex >= 0 ? argv[engineIndex + 1] : "openai"');
    expect(script).toContain('if (engine !== "openai")');
    expect(script).not.toMatch(/api\.elevenlabs\.io|api\.x\.ai|ELEVENLABS_API_KEY|XAI_API_KEY/);
  });

  it("keeps campaign audio out of the production call path", () => {
    const script = read("scripts/generate-campaign-vo.mjs");
    expect(script).toMatch(/marketing and reference use only/i);
    expect(script).toMatch(/official-assets\/audio/);
    // official-assets/ is gitignored and hygiene-banned; the generator must not
    // be pointed at a tracked directory.
    expect(read(".gitignore")).toContain("official-assets/");
  });

  it("keeps the active human-executed launch authorities on BotBound", () => {
    for (const path of [
      "docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md",
      "docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md",
      "docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md",
    ]) {
      const publicGuidance = read(path)
        .replaceAll("X-Wireline-Source-Commit", "")
        .replace(/"Wireline Launch Assets — Certified [^"]+"/g, "");
      expect(publicGuidance, path).not.toMatch(/\bWireline\b|trywireline\.com/);
      expect(publicGuidance, path).toContain("BotBound");
    }
  });
});
