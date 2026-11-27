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
  applyCallDeliveryChange,
  callDeliverySelection,
  normalizeSpeakingRate,
  parseCallDeliveryChange,
  phoneVoiceById,
  phoneVoiceDescription,
  phoneVoiceSelection,
  speakingPaceForRate,
  storedCallDelivery,
  type CallDelivery,
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
  it("is cleared in the source of the other route that saves a voice", () => {
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
    const nothing = {
      speakingRate: null,
      pronunciations: [],
      recognizedNames: [],
      ownGreeting: false,
    };
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
      ownGreeting: false,
    });
    // Only an explicit choice opens calls in the owner's own words.
    for (const ownGreeting of ["true", 1, null, {}]) {
      expect(callDeliverySelection({ [CALL_DELIVERY_KEY]: { ownGreeting } }).ownGreeting).toBe(
        false,
      );
    }
    expect(callDeliverySelection({ [CALL_DELIVERY_KEY]: { ownGreeting: true } }).ownGreeting).toBe(
      true,
    );
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

describe("reading a save request", () => {
  it("accepts exactly one change, cleaned", () => {
    expect(parseCallDeliveryChange({ speakingRate: 1.2 })).toEqual({
      ok: true,
      change: { kind: "pace", speakingRate: 1.2 },
    });
    expect(
      parseCallDeliveryChange({ addPronunciation: { word: " Nguyen  ", say: "Win", extra: true } }),
    ).toEqual({
      ok: true,
      change: { kind: "addPronunciation", entry: { word: "Nguyen", say: "Win" } },
    });
    expect(parseCallDeliveryChange({ removePronunciation: " Nguyen " })).toEqual({
      ok: true,
      change: { kind: "removePronunciation", word: "Nguyen" },
    });
    expect(parseCallDeliveryChange({ addRecognizedName: "Acme   Plumbing" })).toEqual({
      ok: true,
      change: { kind: "addName", name: "Acme Plumbing" },
    });
    expect(parseCallDeliveryChange({ removeRecognizedName: "Acme" })).toEqual({
      ok: true,
      change: { kind: "removeName", name: "Acme" },
    });
  });

  it("refuses a pace that is not one of the named steps", () => {
    for (const speakingRate of [1.15, 0.7, 1.5, "1.2", null]) {
      expect(parseCallDeliveryChange({ speakingRate })).toEqual({
        ok: false,
        error: "Choose a speaking pace from the list.",
      });
    }
  });

  it("refuses an entry that could not be kept as sent", () => {
    for (const body of [
      { addPronunciation: { word: "Same", say: "SAME" } },
      { addPronunciation: { word: "Nguyen" } },
      { addPronunciation: "Nguyen=Win" },
      { addPronunciation: { word: "x".repeat(61), say: "Long" } },
      { addRecognizedName: "!!!" },
      { addRecognizedName: "x".repeat(RECOGNIZED_NAME_MAX + 1) },
      { addRecognizedName: ["Acme"] },
      { removePronunciation: "  " },
      { removeRecognizedName: 7 },
    ]) {
      expect(parseCallDeliveryChange(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("refuses nothing, several changes at once, and a whole list", () => {
    for (const body of [{}, null, [], "pace", { voice: "luna" }]) {
      expect(parseCallDeliveryChange(body)).toEqual({ ok: false, error: "Nothing to save." });
    }
    expect(parseCallDeliveryChange({ speakingRate: 1.2, addRecognizedName: "Acme" })).toEqual({
      ok: false,
      error: "Save one change at a time.",
    });
    // A list is never taken whole: that is how one screen erased another's entry.
    expect(parseCallDeliveryChange({ pronunciations: [{ word: "Nguyen", say: "Win" }] })).toEqual({
      ok: false,
      error: "Nothing to save.",
    });
  });

  it("counts a name the way the phone engine does, so one that saves is always sent", () => {
    // Thirty-one characters to read, fifty-seven as the engine counts them.
    const emoji = "\u{1F600}".repeat(26);
    expect(Array.from(emoji)).toHaveLength(26);
    expect(parseCallDeliveryChange({ addRecognizedName: `Acme ${emoji}` }).ok).toBe(false);
    expect(parseCallDeliveryChange({ addRecognizedName: "x".repeat(50) }).ok).toBe(true);
  });
});

describe("applying one change to what is stored", () => {
  const nothing: CallDelivery = {
    speakingRate: null,
    pronunciations: [],
    recognizedNames: [],
    ownGreeting: false,
  };
  const apply = (current: CallDelivery, body: unknown) => {
    const parsed = parseCallDeliveryChange(body);
    if (!parsed.ok) throw new Error(parsed.error);
    return applyCallDeliveryChange(current, parsed.change);
  };
  const kept = (current: CallDelivery, body: unknown) => {
    const result = apply(current, body);
    if (!result.ok) throw new Error(result.error);
    return result.delivery;
  };

  it("adds to the list as it stands, whoever added the rest", () => {
    const first = kept(nothing, { addPronunciation: { word: "Nguyen", say: "Win" } });
    const second = kept(first, { addPronunciation: { word: "Siobhan", say: "Shi-vawn" } });
    expect(second.pronunciations).toEqual([
      { word: "Nguyen", say: "Win" },
      { word: "Siobhan", say: "Shi-vawn" },
    ]);
    expect(kept(second, { addRecognizedName: "Acme" })).toEqual({
      ...second,
      recognizedNames: ["Acme"],
    });
  });

  it("respells a listed word in place and leaves a listed name alone", () => {
    const current = {
      ...nothing,
      pronunciations: [
        { word: "Nguyen", say: "Win" },
        { word: "Siobhan", say: "Shi-vawn" },
      ],
      recognizedNames: ["Acme"],
    };
    expect(
      kept(current, { addPronunciation: { word: "nguyen", say: "Wen" } }).pronunciations,
    ).toEqual([
      { word: "nguyen", say: "Wen" },
      { word: "Siobhan", say: "Shi-vawn" },
    ]);
    expect(kept(current, { addRecognizedName: "ACME" })).toBe(current);
  });

  it("removes by word or name whatever the capitals, and removing twice changes nothing", () => {
    const current = {
      ...nothing,
      pronunciations: [{ word: "Nguyen", say: "Win" }],
      recognizedNames: ["Acme", "Ridge"],
    };
    const removed = kept(current, { removePronunciation: "NGUYEN" });
    expect(removed.pronunciations).toEqual([]);
    expect(kept(removed, { removePronunciation: "NGUYEN" }).pronunciations).toEqual([]);
    expect(kept(current, { removeRecognizedName: "acme" }).recognizedNames).toEqual(["Ridge"]);
  });

  it("refuses a new entry past the most one Bot can keep", () => {
    const full = {
      ...nothing,
      pronunciations: Array.from({ length: PRONUNCIATION_LIMIT }, (_, i) => ({
        word: `Word${i}`,
        say: `Say${i}`,
      })),
      recognizedNames: Array.from({ length: RECOGNIZED_NAME_LIMIT }, (_, i) => `Name${i}`),
    };
    expect(apply(full, { addPronunciation: { word: "Extra", say: "Ex-tra" } })).toEqual({
      ok: false,
      error: "40 is the most one Bot can keep. Remove one to add another.",
    });
    expect(apply(full, { addRecognizedName: "Extra" }).ok).toBe(false);
    // Respelling a listed word adds nothing, so it is still allowed.
    expect(apply(full, { addPronunciation: { word: "Word0", say: "First" } }).ok).toBe(true);
  });

  it("turns the owner's own greeting on and off, storing it only while it is on", () => {
    expect(parseCallDeliveryChange({ ownGreeting: true })).toEqual({
      ok: true,
      change: { kind: "greeting", own: true },
    });
    for (const ownGreeting of ["yes", 1, null]) {
      expect(parseCallDeliveryChange({ ownGreeting })).toEqual({
        ok: false,
        error: "Choose how your Bot greets callers.",
      });
    }
    const on = kept(nothing, { ownGreeting: true });
    expect(on.ownGreeting).toBe(true);
    expect(storedCallDelivery(on)).toEqual({
      pronunciations: [],
      recognizedNames: [],
      ownGreeting: true,
    });
    const off = kept(on, { ownGreeting: false });
    expect(off).toEqual(nothing);
    expect(storedCallDelivery(off)).not.toHaveProperty("ownGreeting");
  });

  it("stores a pace only once one was chosen", () => {
    expect(storedCallDelivery(nothing)).toEqual({ pronunciations: [], recognizedNames: [] });
    expect(storedCallDelivery(kept(nothing, { speakingRate: 0.9 }))).toEqual({
      speakingRate: 0.9,
      pronunciations: [],
      recognizedNames: [],
    });
    // What is stored reads back as what was applied.
    const changed = kept(nothing, { addRecognizedName: "Acme" });
    expect(callDeliverySelection({ [CALL_DELIVERY_KEY]: storedCallDelivery(changed) })).toEqual(
      changed,
    );
  });
});
