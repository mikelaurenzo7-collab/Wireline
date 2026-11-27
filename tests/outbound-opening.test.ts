import { describe, expect, it } from "vitest";

import { complianceFirstMessagePrefix } from "../src/lib/agent-runtime";
import { detectAiDisclosure, detectRecordingDisclosure } from "../src/lib/tcpa-consent";
import { composeInboundOpening, inboundDisclosureLine } from "../src/lib/voice/inbound-opening";
import {
  agentNameAddsToBusiness,
  composeOutboundOpening,
  OUTBOUND_OPENING_QUESTION,
  OUTBOUND_OPT_OUT_NOTICE,
  OUTBOUND_RECORDING_NOTICE,
} from "../src/lib/voice/outbound-opening";

const NUMBER = "seven seven three, six nine four, nine seven eight zero";

describe("the first line of an outbound call", () => {
  it("names the Bot and the business once, gives the number and hands over the turn", () => {
    expect(
      composeOutboundOpening({
        agentName: "Sam",
        businessName: "Ridge Dental",
        contactName: "Dana",
        callbackNumberSpoken: NUMBER,
        recordingEnabled: false,
        telemarketing: false,
      }),
    ).toBe(
      `Hi Dana, this is Sam. I'm an AI assistant calling for Ridge Dental. You can call us back at ${NUMBER}. Is now a good time?`,
    );
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
    expect(opening).toBe(
      `Hi, I'm an AI assistant calling for Michael Laurenzo. You can call us back at ${NUMBER}. Is now a good time?`,
    );
    expect(opening.match(/Michael/g)).toHaveLength(1);
    expect(agentNameAddsToBusiness("Michael", "Michael Laurenzo")).toBe(false);
    expect(agentNameAddsToBusiness("ridge dental", "Ridge Dental")).toBe(false);
    expect(agentNameAddsToBusiness("Sam", "Ridge Dental")).toBe(true);
    // Part of a longer word is a different name.
    expect(agentNameAddsToBusiness("Mike", "Mikes Plumbing")).toBe(true);
    expect(agentNameAddsToBusiness("", "Ridge Dental")).toBe(false);
    expect(agentNameAddsToBusiness("Sam", "")).toBe(true);
  });

  it("puts the marketing opt-out directly after the identification, then the recording notice", () => {
    const opening = composeOutboundOpening({
      agentName: "Sam",
      businessName: "Ridge Dental",
      callbackNumberSpoken: NUMBER,
      recordingEnabled: true,
      telemarketing: true,
    });
    expect(opening).toBe(
      `Hi, this is Sam. I'm an AI assistant calling for Ridge Dental. ${OUTBOUND_OPT_OUT_NOTICE} ${OUTBOUND_RECORDING_NOTICE} You can call us back at ${NUMBER}. ${OUTBOUND_OPENING_QUESTION}`,
    );
  });

  it("is evidence the ledger can find: an AI disclosure always, a recording notice only when recording", () => {
    for (const agentName of ["Sam", "Ridge Dental", ""]) {
      const quiet = composeOutboundOpening({
        agentName,
        businessName: "Ridge Dental",
        recordingEnabled: false,
        telemarketing: false,
      });
      expect(detectAiDisclosure(quiet).found, quiet).toBe(true);
      expect(detectRecordingDisclosure(quiet).found, quiet).toBe(false);
      const recorded = composeOutboundOpening({
        agentName,
        businessName: "Ridge Dental",
        recordingEnabled: true,
        telemarketing: false,
      });
      expect(detectRecordingDisclosure(recorded).found, recorded).toBe(true);
    }
  });

  it("leaves out what it does not have", () => {
    expect(
      composeOutboundOpening({ agentName: "Sam", recordingEnabled: false, telemarketing: false }),
    ).toBe("Hi, this is Sam. I'm an AI assistant. Is now a good time?");
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

  it("keeps a Bot's own name beside a different business name", () => {
    expect(
      inboundDisclosureLine({
        agentName: "Nora",
        businessName: "BotBound",
        recordingEnabled: false,
      }),
    ).toBe("Hi, I'm Nora, and I'm an AI assistant with BotBound.");
  });
});
