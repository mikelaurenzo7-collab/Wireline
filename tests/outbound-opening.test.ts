import { describe, expect, it } from "vitest";

import { complianceFirstMessagePrefix } from "../src/lib/agent-runtime";
import { detectAiDisclosure, detectRecordingDisclosure } from "../src/lib/tcpa-consent";
import {
  AI_HONESTY_RULE,
  composeInboundOpening,
  defaultOwnGreeting,
  inboundDisclosureLine,
} from "../src/lib/voice/inbound-opening";
import {
  agentNameAddsToBusiness,
  composeOutboundOpening,
  OUTBOUND_OPENING_QUESTION,
  OUTBOUND_OPT_OUT_NOTICE,
  OUTBOUND_RECORDING_NOTICE,
} from "../src/lib/voice/outbound-opening";

const NUMBER = "seven seven three, six nine four, nine seven eight zero";

describe("the first line of an outbound call", () => {
  it("is one breath: who is calling, for which business, and a question", () => {
    expect(
      composeOutboundOpening({
        agentName: "Sam",
        businessName: "Ridge Dental",
        contactName: "Dana",
        callbackNumberSpoken: NUMBER,
        recordingEnabled: false,
        telemarketing: false,
      }),
    ).toBe("Hi Dana, this is Sam, an AI assistant with Ridge Dental. Is now a good time?");
  });

  it("says the name once when the Bot is named for its owner or its business", () => {
    // A Bot called Michael at a business called Michael Laurenzo said the name three times.
    const opening = composeOutboundOpening({
      agentName: "Michael",
      businessName: "Michael Laurenzo",
      callbackNumberSpoken: NUMBER,
      recordingEnabled: false,
      telemarketing: false,
    });
    expect(opening).toBe("Hi, I'm an AI assistant with Michael Laurenzo. Is now a good time?");
    expect(opening.match(/Michael/g)).toHaveLength(1);
    expect(agentNameAddsToBusiness("Michael", "Michael Laurenzo")).toBe(false);
    expect(agentNameAddsToBusiness("ridge dental", "Ridge Dental")).toBe(false);
    expect(agentNameAddsToBusiness("Sam", "Ridge Dental")).toBe(true);
    // Part of a longer word is a different name.
    expect(agentNameAddsToBusiness("Mike", "Mikes Plumbing")).toBe(true);
    expect(agentNameAddsToBusiness("", "Ridge Dental")).toBe(false);
    expect(agentNameAddsToBusiness("Sam", "")).toBe(true);
  });

  it("gives a marketing call its opt-out directly after the identification, and its number", () => {
    const marketing = { agentName: "Sam", businessName: "Ridge Dental", telemarketing: true };
    expect(
      composeOutboundOpening({
        ...marketing,
        callbackNumberSpoken: NUMBER,
        recordingEnabled: true,
      }),
    ).toBe(
      `Hi, this is Sam, an AI assistant with Ridge Dental. ${OUTBOUND_OPT_OUT_NOTICE} ${OUTBOUND_RECORDING_NOTICE} You can reach us at ${NUMBER}. ${OUTBOUND_OPENING_QUESTION}`,
    );
    expect(
      composeOutboundOpening({
        ...marketing,
        callbackNumberSpoken: NUMBER,
        recordingEnabled: false,
      }),
    ).toBe(
      `Hi, this is Sam, an AI assistant with Ridge Dental. ${OUTBOUND_OPT_OUT_NOTICE} You can reach us at ${NUMBER}. Is now a good time?`,
    );
    // With no number configured there is none to give.
    expect(composeOutboundOpening({ ...marketing, recordingEnabled: false })).toBe(
      `Hi, this is Sam, an AI assistant with Ridge Dental. ${OUTBOUND_OPT_OUT_NOTICE} Is now a good time?`,
    );
  });

  it("leaves the number for the goodbye on every call that is not marketing", () => {
    for (const recordingEnabled of [false, true]) {
      const opening = composeOutboundOpening({
        agentName: "Sam",
        businessName: "Ridge Dental",
        callbackNumberSpoken: NUMBER,
        recordingEnabled,
        telemarketing: false,
      });
      expect(opening).not.toContain(NUMBER);
      expect(opening).not.toContain("stop calling");
    }
  });

  it("says each notice in a few plain words", () => {
    expect(OUTBOUND_OPT_OUT_NOTICE).toBe(
      "If you'd rather we not call again, just say stop calling.",
    );
    expect(OUTBOUND_RECORDING_NOTICE).toBe("This call may be recorded.");
    for (const notice of [OUTBOUND_OPT_OUT_NOTICE, OUTBOUND_RECORDING_NOTICE]) {
      expect(notice).not.toMatch(/compliance|do not call list|automated/i);
    }
  });

  it("is evidence the ledger can find: an AI disclosure always, a recording notice only when recording", () => {
    // A name is the owner's own, punctuation and length included.
    const longName = "Samantha ".repeat(14).trim();
    for (const agentName of ["Sam", "Ridge Dental", "", "Dr. Sam", "Sam, Jr.", "J.D.", longName]) {
      for (const businessName of ["Ridge Dental", ""]) {
        const quiet = composeOutboundOpening({
          agentName,
          businessName,
          recordingEnabled: false,
          telemarketing: false,
        });
        expect(detectAiDisclosure(quiet).found, quiet).toBe(true);
        expect(detectRecordingDisclosure(quiet).found, quiet).toBe(false);
        const recorded = composeOutboundOpening({
          agentName,
          businessName,
          recordingEnabled: true,
          telemarketing: false,
        });
        expect(detectRecordingDisclosure(recorded).found, recorded).toBe(true);
      }
    }
  });

  it("leaves out what it does not have", () => {
    expect(
      composeOutboundOpening({ agentName: "Sam", recordingEnabled: false, telemarketing: false }),
    ).toBe("Hi, this is Sam, an AI assistant. Is now a good time?");
  });

  it("uses the same notices the legacy prefix speaks", () => {
    const legacy = complianceFirstMessagePrefix("none", "Ridge Dental", {
      telemarketing: true,
      recordingEnabled: true,
    });
    expect(legacy).toContain(OUTBOUND_OPT_OUT_NOTICE);
    expect(legacy).toContain(OUTBOUND_RECORDING_NOTICE);
  });
});

describe("the first line of an inbound call", () => {
  const bot = { agentName: "Sam", businessName: "Ridge Dental LLC", recordingEnabled: false };

  it("introduces the Bot once, in passing, then continues with the owner's greeting", () => {
    const introduction = "Hi, I'm Sam, an AI assistant with Ridge Dental LLC.";
    // A hello-style first sentence is folded into the introduction.
    expect(composeInboundOpening({ greeting: "Hi, this is Sam. How can I help?", ...bot })).toBe(
      `${introduction} How can I help?`,
    );
    expect(
      composeInboundOpening({ greeting: "Thanks for calling! We open at nine.", ...bot }),
    ).toBe(`${introduction} We open at nine.`);
    // Anything else is kept whole.
    expect(composeInboundOpening({ greeting: "We open at nine. How can I help?", ...bot })).toBe(
      `${introduction} We open at nine. How can I help?`,
    );
    expect(composeInboundOpening({ greeting: "", ...bot })).toBe(
      `${introduction} How can I help you?`,
    );
    // No separate announcement, no "and I'm", nothing said twice.
    expect(introduction.match(/AI/g)).toHaveLength(1);
  });

  it("also says a shared name once", () => {
    expect(
      inboundDisclosureLine({
        agentName: "Michael",
        businessName: "Michael Laurenzo",
        recordingEnabled: false,
      }),
    ).toBe("Hi, I'm an AI assistant with Michael Laurenzo.");
    expect(
      composeInboundOpening({
        greeting: "Hi, this is Michael. How can I help?",
        agentName: "Michael",
        businessName: "Michael Laurenzo",
        recordingEnabled: false,
      }),
    ).toBe("Hi, I'm an AI assistant with Michael Laurenzo. How can I help?");
  });

  it("names the business when there is one, and only then", () => {
    expect(
      inboundDisclosureLine({
        agentName: "Nora",
        businessName: "BotBound",
        recordingEnabled: false,
      }),
    ).toBe("Hi, I'm Nora, an AI assistant with BotBound.");
    expect(
      inboundDisclosureLine({ agentName: "Nora", businessName: null, recordingEnabled: false }),
    ).toBe("Hi, I'm Nora, an AI assistant.");
  });

  it("gives the recording notice as one short sentence, only when calls are recorded", () => {
    expect(
      inboundDisclosureLine({
        agentName: "Nora",
        businessName: "BotBound",
        recordingEnabled: true,
      }),
    ).toBe("Hi, I'm Nora, an AI assistant with BotBound. This call may be recorded.");
    const recorded = composeInboundOpening({
      greeting: "Hi, this is Sam. How can I help?",
      ...bot,
      recordingEnabled: true,
    });
    expect(recorded).toBe(
      "Hi, I'm Sam, an AI assistant with Ridge Dental LLC. This call may be recorded. How can I help?",
    );
    expect(detectRecordingDisclosure(recorded).found).toBe(true);
    expect(detectRecordingDisclosure(composeInboundOpening({ greeting: "", ...bot })).found).toBe(
      false,
    );
  });

  it("keeps as written a greeting that already says it is an AI assistant", () => {
    const written = "Hello, I'm an AI assistant for Ridge Dental. What do you need?";
    expect(composeInboundOpening({ greeting: written, ...bot })).toBe(written);
    // Recorded calls say so first, and the owner's words still follow untouched.
    expect(composeInboundOpening({ greeting: written, ...bot, recordingEnabled: true })).toBe(
      `This call may be recorded. ${written}`,
    );
  });

  it("is an introduction the compliance record recognises", () => {
    for (const agentName of ["Sam", "Ridge Dental LLC", ""]) {
      const opening = composeInboundOpening({ greeting: "", ...bot, agentName });
      expect(detectAiDisclosure(opening).found, opening).toBe(true);
    }
    for (const agentName of ["Dr. Sam", "Sam, Jr."]) {
      const opening = composeInboundOpening({ greeting: "", ...bot, agentName });
      expect(opening).toBe(
        `Hi, I'm ${agentName}, an AI assistant with Ridge Dental LLC. How can I help you?`,
      );
      expect(detectAiDisclosure(opening).found, opening).toBe(true);
    }
    // A caller asking is not the Bot saying, and neither is a denial.
    expect(detectAiDisclosure("Is this Sam, an AI assistant?").found).toBe(false);
    expect(detectAiDisclosure("I'm not, strictly speaking, an AI assistant.").found).toBe(false);
  });
});

describe("an inbound call that opens in the owner's own words", () => {
  const bot = { agentName: "Sam", businessName: "Ridge Dental LLC", recordingEnabled: false };
  const own = (input: Partial<Parameters<typeof composeInboundOpening>[0]>) =>
    composeInboundOpening({ greeting: "", ...bot, ...input, ownWords: true });
  const notice = "This call may be recorded.";

  it("says exactly what the owner wrote, with nothing added or taken away", () => {
    for (const greeting of [
      "Hey, I'm Sam with Ridge Dental LLC, how can I help you?",
      "Thanks for calling Ridge Dental! We're open nine to five. What can I do for you?",
      "Thanks for calling Dr. Smith's office. How can I help?",
      "Ridge Dental.",
    ]) {
      expect(own({ greeting }), greeting).toBe(greeting);
      expect(detectAiDisclosure(own({ greeting })).found).toBe(false);
    }
    // Only stray line breaks and spaces are tidied.
    expect(own({ greeting: "  Hey there.\n\nHow can I help?  " })).toBe(
      "Hey there. How can I help?",
    );
  });

  it("names the Bot and the business when the owner has written nothing", () => {
    const natural = "Hey, I'm Sam with Ridge Dental LLC. How can I help you?";
    expect(own({ greeting: "" })).toBe(natural);
    // The greeting every Bot is created with is not one the owner chose.
    expect(own({ greeting: "Hi, this is Sam. How can I help?" })).toBe(natural);
    expect(own({ greeting: "hi, this is sam. how can i help?" })).toBe(natural);
    expect(defaultOwnGreeting({ agentName: "Sam", businessName: null })).toBe(
      "Hey, I'm Sam. How can I help you?",
    );
    // A Bot named for its business says the name once.
    expect(defaultOwnGreeting({ agentName: "Michael", businessName: "Michael Laurenzo" })).toBe(
      "Hey, thanks for calling Michael Laurenzo. How can I help you?",
    );
    expect(defaultOwnGreeting({ agentName: "", businessName: "" })).toBe(
      "Hey, thanks for calling. How can I help you?",
    );
  });

  it("still gives the recording notice whenever calls are recorded", () => {
    // First, so it is never spoken over the caller's answer or in the middle of a sentence.
    expect(own({ greeting: "", recordingEnabled: true })).toBe(
      `${notice} Hey, I'm Sam with Ridge Dental LLC. How can I help you?`,
    );
    expect(
      own({ greeting: "Welcome to St. Mary's, how can I help?", recordingEnabled: true }),
    ).toBe(`${notice} Welcome to St. Mary's, how can I help?`);
    // Said even when the greeting mentions recording: twice is harmless, a
    // greeting that says calls are "never recorded for training" would not be.
    for (const written of [
      "Hi, you've reached Ridge Dental. This call is recorded. How can I help?",
      "This line is never recorded for training. How can I help?",
    ]) {
      expect(own({ greeting: written, recordingEnabled: true })).toBe(`${notice} ${written}`);
    }
    expect(detectRecordingDisclosure(own({ greeting: "" })).found).toBe(false);
  });

  it("picks the call back up plainly after a dropped leg, in either mode, without a second introduction", () => {
    const resumed = "Sorry, we got cut off for a moment. What can I help you with?";
    expect(own({ leg: "resume" })).toBe(resumed);
    expect(own({ leg: "resume", recordingEnabled: true })).toBe(`${notice} ${resumed}`);
    expect(composeInboundOpening({ greeting: "Hi, this is Sam.", ...bot, leg: "resume" })).toBe(
      resumed,
    );
    expect(
      composeInboundOpening({
        greeting: "Hi, this is Sam.",
        ...bot,
        leg: "resume",
        recordingEnabled: true,
      }),
    ).toBe(`${notice} ${resumed}`);
  });

  it("has the Bot say what it is whenever it is asked, and not otherwise", () => {
    expect(AI_HONESTY_RULE).toContain("say plainly that you are an AI assistant");
    expect(AI_HONESTY_RULE).toContain("Never say or imply that you are a person");
    expect(AI_HONESTY_RULE).toContain("Do not bring it up otherwise");
  });
});
