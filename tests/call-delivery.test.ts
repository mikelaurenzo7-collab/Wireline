import { describe, expect, it } from "vitest";

import { CALL_DELIVERY_KEY } from "../src/lib/phone-voices";
import {
  callDeliveryFor,
  pronunciationTouchesRequiredWording,
} from "../src/lib/voice/call-delivery";
import { composeInboundOpening } from "../src/lib/voice/inbound-opening";
import { composeOutboundOpening } from "../src/lib/voice/outbound-opening";
import { pronunciationRewriter } from "../src/lib/voice/pronunciation-text";

const outbound = composeOutboundOpening({
  agentName: "Sam",
  businessName: "Ridge Dental",
  contactName: "Dana",
  callbackNumberSpoken: "seven seven three, five five five, zero one zero zero",
  recordingEnabled: true,
  telemarketing: true,
});
const inbound = composeInboundOpening({
  greeting: "Hi, this is Sam. How can I help?",
  agentName: "Sam",
  businessName: "Ridge Dental",
  recordingEnabled: true,
});

describe("pronunciations and the wording every call must speak", () => {
  it("refuses any entry that shares a word with a scripted opening", () => {
    for (const word of [
      "AI",
      "assistant",
      "AI assistant",
      "recorded",
      "may be",
      "stop calling",
      "do not call",
      "seven",
      "I'm",
      // Reaches from the required words into the owner's own name.
      "assistant calling for Ridge",
      "Ridge Dental and Sons",
    ]) {
      expect(pronunciationTouchesRequiredWording(word), word).toBe(true);
    }
  });

  it("allows the names and unusual words an owner needs", () => {
    for (const word of [
      "Ridge",
      "Ridge Dental",
      "Nguyen",
      "Laurenzo",
      "Siobhan",
      "BotBound",
      "C++",
    ]) {
      expect(pronunciationTouchesRequiredWording(word), word).toBe(false);
    }
  });

  it("means no allowed entry can change anything but a name in either opening", () => {
    // Every word of both openings, tried as a pronunciation of its own.
    const words = [...new Set(`${outbound} ${inbound}`.match(/[\p{L}\p{N}]+/gu))];
    const allowed = words.filter((word) => !pronunciationTouchesRequiredWording(word));
    // Only the owner's own names are left to respell.
    expect(allowed.sort()).toEqual(["Dana", "Dental", "Ridge", "Sam"]);
    const say = pronunciationRewriter(allowed.map((word) => ({ word, say: "XX" })));
    const blank = (text: string) => text.replace(/\b(?:Dana|Dental|Ridge|Sam)\b/g, "XX");
    expect(say(outbound)).toBe(blank(outbound));
    expect(say(inbound)).toBe(blank(inbound));
    expect(say(outbound)).toContain("I'm an AI assistant calling for XX XX.");
    expect(say(outbound)).toContain("This call may be recorded for quality and compliance.");
    expect(say(outbound)).toContain("seven seven three, five five five, zero one zero zero");
  });

  it("leaves a stored entry out of calls if it would touch that wording", () => {
    const variables = {
      [CALL_DELIVERY_KEY]: {
        speakingRate: 1.2,
        pronunciations: [
          { word: "AI assistant", say: "team member" },
          { word: "Nguyen", say: "Win" },
        ],
        recognizedNames: ["Siobhan"],
      },
    };
    expect(callDeliveryFor(variables)).toEqual({
      speakingRate: 1.2,
      pronunciations: [{ word: "Nguyen", say: "Win" }],
      recognizedNames: ["Siobhan"],
    });
    expect(callDeliveryFor(null)).toEqual({
      speakingRate: null,
      pronunciations: [],
      recognizedNames: [],
    });
  });
});
