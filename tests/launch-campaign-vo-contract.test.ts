import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs build script, imported for its canonical copy.
import { CAMPAIGN_VO, DEFAULT_VOICE_ID, speakable } from "../scripts/generate-campaign-vo.mjs";
import { ELEVENLABS_CURATED_VOICES } from "../src/lib/voice-catalog";

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
    expect(tracks).toHaveLength(4);
  });

  it("covers every launch cut that needs narration", () => {
    // The media kit's cut table drives the audio set. A cut listed there with
    // no track is how the Live Video reel ended up needing hand-scored VO.
    expect(tracks.map((track) => track.id)).toContain("live-video-25s");
  });

  it("keeps every voiceover verbatim from the campaign document", () => {
    for (const track of tracks) {
      expect(campaign, `${track.id} copy has drifted from the campaign document`).toContain(
        track.text,
      );
    }
  });

  it("follows the delivery guide when speaking the domain and prices", () => {
    // The guide: speak "trywireline.com" as "try wireline dot com", and speak
    // prices as words, never digits.
    expect(speakable("Build free at trywireline.com.")).toBe("Build free at try wireline dot com.");
    for (const track of tracks) {
      const spoken = speakable(track.text);
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

  it("narrates with a real runtime Studio voice, not a marketing-only voice", () => {
    // The launch reels claim voice quality. That claim is honest because the
    // narration voice is one of the curated ElevenLabs Studio voices customers
    // actually put on their phone line — the same catalog the call runtime
    // routes through Vapi. If the default drifts off-catalog, the reels start
    // selling a voice the product does not ship.
    expect(ELEVENLABS_CURATED_VOICES.map((voice) => voice.id)).toContain(DEFAULT_VOICE_ID);
  });

  it("keeps campaign audio out of the production call path", () => {
    const script = read("scripts/generate-campaign-vo.mjs");
    expect(script).toMatch(/marketing and reference use only/i);
    expect(script).toMatch(/official-assets\/audio/);
    // official-assets/ is gitignored and hygiene-banned; the generator must not
    // be pointed at a tracked directory.
    expect(read(".gitignore")).toContain("official-assets/");
  });
});
