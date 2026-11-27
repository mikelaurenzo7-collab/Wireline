import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CALL_DELIVERY_KEY,
  PHONE_BUILTIN_VOICE_KEY,
  PHONE_VOICES,
  PRONUNCIATION_LIMIT,
  PRONUNCIATION_SAY_MAX,
  RECOGNIZED_NAME_LIMIT,
  RECOGNIZED_NAME_MAX,
  SPEAKING_PACES,
  callDeliverySelection,
  normalizeSpeakingRate,
  parseCallDeliveryPatch,
  phoneVoiceById,
  phoneVoiceDescription,
  phoneVoiceSelection,
  speakingPaceForRate,
} from "../src/lib/phone-voices";
import { OPENAI_REALTIME_VOICES, OPENAI_REALTIME_VOICE_IDS } from "../src/lib/voice-catalog";
import {
  PHONE_SPEAKING_RATE_DEFAULT,
  XAI_GROK_VOICES,
  XAI_STOCK_VOICE_GENDER,
  xaiVoiceForSavedVoice,
} from "../src/lib/voice/xai-voice-config";

describe("built-in phone voices", () => {
  it("lists every voice the phone engine speaks, once, with the gender the engine reports", () => {
    expect(PHONE_VOICES.map((voice) => voice.id).sort()).toEqual([...XAI_GROK_VOICES].sort());
    for (const voice of PHONE_VOICES) {
      expect(
        XAI_STOCK_VOICE_GENDER[voice.id as keyof typeof XAI_STOCK_VOICE_GENDER],
        voice.id,
      ).toBe(voice.gender);
      // The name an owner sees is the id a call speaks, so a pick is never a different voice.
      expect(voice.name.toLowerCase()).toBe(voice.id);
    }
  });

  it("tells every voice apart in two plain words", () => {
    const descriptions = PHONE_VOICES.map(phoneVoiceDescription);
    expect(new Set(descriptions).size).toBe(PHONE_VOICES.length);
    for (const description of descriptions) expect(description).toMatch(/^[A-Z][A-Za-z -]+ & /);
    expect(phoneVoiceDescription(phoneVoiceById("eve")!)).toBe("Energetic & Upbeat · British");
    expect(phoneVoiceDescription(phoneVoiceById("carina")!)).toBe("Soft & Soothing");
  });

  it("gives each voice a saved voice for the backup engine, of the same gender", () => {
    for (const voice of PHONE_VOICES) {
      expect(OPENAI_REALTIME_VOICE_IDS, voice.id).toContain(voice.fallbackVoiceId);
      const saved = OPENAI_REALTIME_VOICES.find(({ id }) => id === voice.fallbackVoiceId)!;
      if (saved.gender) expect(saved.gender, voice.id).toBe(voice.gender);
    }
    // Picking a saved voice's closest match by name leaves the saved voice as it was.
    for (const saved of OPENAI_REALTIME_VOICE_IDS) {
      expect(phoneVoiceById(xaiVoiceForSavedVoice(saved))!.fallbackVoiceId, saved).toBe(saved);
    }
  });

  it("reads a stored pick by name and nothing else", () => {
    expect(phoneVoiceSelection({ [PHONE_BUILTIN_VOICE_KEY]: " Luna " })?.id).toBe("luna");
    for (const stored of ["marin", "", 7, null, { id: "luna" }]) {
      expect(phoneVoiceSelection({ [PHONE_BUILTIN_VOICE_KEY]: stored })).toBeNull();
    }
    expect(phoneVoiceSelection(null)).toBeNull();
    expect(phoneVoiceSelection(["luna"])).toBeNull();
  });
});

describe("a voice picked by name", () => {
  it("is cleared by the other route that saves a voice, so the two never disagree", () => {
    const service = readFileSync("src/lib/voice/openai-live-agent-service.ts", "utf8");
    const setter = service.slice(
      service.indexOf("export async function setOpenAILiveVoiceProfile"),
    );
    expect(setter.slice(0, 900)).toContain("delete variables[PHONE_BUILTIN_VOICE_KEY]");
    expect(setter.slice(0, 900)).toContain("voiceId: voice");
  });
});

describe("speaking pace", () => {
  it("offers five ascending steps around the platform's own pace", () => {
    const rates = SPEAKING_PACES.map((pace) => pace.rate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
    expect(rates).toEqual([0.9, 1, 1.1, 1.2, 1.3]);
    expect(speakingPaceForRate(PHONE_SPEAKING_RATE_DEFAULT).label).toBe("Natural");
    // A rate set outside the picker still shows as its nearest step.
    expect(speakingPaceForRate(1.14).id).toBe("natural");
    expect(speakingPaceForRate(0.7).id).toBe("slow");
    expect(speakingPaceForRate(1.5).id).toBe("fast");
  });

  it("keeps a stored rate only inside the documented range", () => {
    expect(normalizeSpeakingRate(1.234)).toBe(1.23);
    expect(normalizeSpeakingRate(0.7)).toBe(0.7);
    expect(normalizeSpeakingRate(1.5)).toBe(1.5);
    for (const outside of [0.69, 1.51, Number.NaN, "1.1", null, undefined]) {
      expect(normalizeSpeakingRate(outside)).toBeNull();
    }
  });
});

describe("call delivery", () => {
  it("defaults to nothing chosen", () => {
    const nothing = { speakingRate: null, pronunciations: [], recognizedNames: [] };
    expect(callDeliverySelection(null)).toEqual(nothing);
    expect(callDeliverySelection({ [CALL_DELIVERY_KEY]: "fast" })).toEqual(nothing);
    expect(callDeliverySelection({ [CALL_DELIVERY_KEY]: [1.2] })).toEqual(nothing);
  });

  it("reads what was stored and drops whatever could not be spoken or heard", () => {
    const delivery = callDeliverySelection({
      [CALL_DELIVERY_KEY]: {
        speakingRate: 1.2,
        pronunciations: [
          { word: "  Laurenzo ", say: "Lor-EN-zo\n" },
          { word: "laurenzo", say: "Again" },
          { word: "Same", say: "same" },
          { word: "", say: "Nothing" },
          { word: "...", say: "Dots" },
          { word: "Long", say: "x".repeat(PRONUNCIATION_SAY_MAX + 1) },
          "not an entry",
          { word: "Nguyen", say: "Win" },
        ],
        recognizedNames: [
          " Siobhan ",
          "siobhan",
          12,
          "",
          "x".repeat(RECOGNIZED_NAME_MAX + 1),
          "Acme\u0000 Plumbing",
        ],
      },
    });
    expect(delivery).toEqual({
      speakingRate: 1.2,
      pronunciations: [
        { word: "Laurenzo", say: "Lor-EN-zo" },
        { word: "Nguyen", say: "Win" },
      ],
      recognizedNames: ["Siobhan", "Acme Plumbing"],
    });
  });

  it("never keeps more than one Bot's worth", () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      word: `Word${index}`,
      say: `Say${index}`,
    }));
    const delivery = callDeliverySelection({
      [CALL_DELIVERY_KEY]: {
        pronunciations: many,
        recognizedNames: many.map((entry) => entry.word),
      },
    });
    expect(delivery.pronunciations).toHaveLength(PRONUNCIATION_LIMIT);
    expect(delivery.recognizedNames).toHaveLength(RECOGNIZED_NAME_LIMIT);
  });
});

describe("saving call delivery", () => {
  it("accepts one part at a time, cleaned", () => {
    expect(parseCallDeliveryPatch({ speakingRate: 1.2 })).toEqual({
      ok: true,
      patch: { speakingRate: 1.2 },
    });
    expect(
      parseCallDeliveryPatch({ pronunciations: [{ word: " Nguyen  ", say: "Win", extra: true }] }),
    ).toEqual({ ok: true, patch: { pronunciations: [{ word: "Nguyen", say: "Win" }] } });
    expect(parseCallDeliveryPatch({ recognizedNames: ["Acme   Plumbing"] })).toEqual({
      ok: true,
      patch: { recognizedNames: ["Acme Plumbing"] },
    });
    // Clearing a list is a save like any other.
    expect(parseCallDeliveryPatch({ pronunciations: [], recognizedNames: [] })).toEqual({
      ok: true,
      patch: { pronunciations: [], recognizedNames: [] },
    });
  });

  it("refuses a pace that is not one of the named steps", () => {
    for (const speakingRate of [1.15, 0.7, 1.5, "1.2", null]) {
      expect(parseCallDeliveryPatch({ speakingRate })).toEqual({
        ok: false,
        error: "Choose a speaking pace from the list.",
      });
    }
  });

  it("refuses a list outright when any entry in it would be dropped", () => {
    const refused = (body: unknown) => {
      const result = parseCallDeliveryPatch(body);
      expect(result.ok, JSON.stringify(body)).toBe(false);
    };
    refused({
      pronunciations: [
        { word: "Nguyen", say: "Win" },
        { word: "nguyen", say: "Wen" },
      ],
    });
    refused({ pronunciations: [{ word: "Same", say: "SAME" }] });
    refused({ pronunciations: [{ word: "Nguyen" }] });
    refused({ pronunciations: "Nguyen=Win" });
    refused({
      pronunciations: Array.from({ length: PRONUNCIATION_LIMIT + 1 }, (_, index) => ({
        word: `Word${index}`,
        say: `Say${index}`,
      })),
    });
    refused({ recognizedNames: ["Siobhan", "SIOBHAN"] });
    refused({ recognizedNames: ["!!!"] });
    refused({ recognizedNames: ["x".repeat(RECOGNIZED_NAME_MAX + 1)] });
    refused({
      recognizedNames: Array.from({ length: RECOGNIZED_NAME_LIMIT + 1 }, (_, i) => `N${i}`),
    });
    // One bad part refuses the whole save, so nothing is half-kept.
    refused({ speakingRate: 1.2, recognizedNames: ["!!!"] });
  });

  it("refuses a save with nothing in it", () => {
    for (const body of [{}, null, [], "pace", { voice: "luna" }]) {
      expect(parseCallDeliveryPatch(body)).toEqual({ ok: false, error: "Nothing to save." });
    }
  });
});
