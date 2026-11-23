import { describe, expect, it } from "vitest";
import { matchesCarrierKeyword, matchesSmsRevocationRequest } from "../src/lib/carrier-keywords";

const OPT_OUT = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "opt out"]);
const OPT_IN = new Set(["start", "unstop", "yes", "opt in"]);

// Callers lowercase + trim before matching; mirror that here.
const norm = (s: string) => s.trim().toLowerCase();

describe("matchesCarrierKeyword", () => {
  it("matches the bare keyword", () => {
    expect(matchesCarrierKeyword(norm("STOP"), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("start"), OPT_IN)).toBe(true);
  });

  it("matches a keyword wrapped in edge punctuation/whitespace", () => {
    expect(matchesCarrierKeyword(norm("STOP."), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("  STOP!  "), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("(unsubscribe)"), OPT_OUT)).toBe(true);
  });

  it("matches a leading keyword followed by more words", () => {
    expect(matchesCarrierKeyword(norm("STOP CALLING ME"), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("cancel please"), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("end - no more texts"), OPT_OUT)).toBe(true);
  });

  it("still matches multi-word keywords exactly", () => {
    expect(matchesCarrierKeyword(norm("opt out"), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("Opt Out."), OPT_OUT)).toBe(true);
  });

  it("does NOT match an embedded (non-leading) mention — avoids false opt-outs", () => {
    expect(matchesCarrierKeyword(norm("please don't stop the updates"), OPT_OUT)).toBe(false);
    expect(matchesCarrierKeyword(norm("where is the bus stop"), OPT_OUT)).toBe(false);
  });

  it("does not match unrelated text or empty input", () => {
    expect(matchesCarrierKeyword(norm("what are your hours?"), OPT_OUT)).toBe(false);
    expect(matchesCarrierKeyword(norm(""), OPT_OUT)).toBe(false);
    expect(matchesCarrierKeyword(norm("!!!"), OPT_OUT)).toBe(false);
  });
});

describe("clear requests to stop SMS", () => {
  it.each([
    "Please stop texting me.",
    "Don't contact me again",
    "Do not message me anymore!",
    "Remove me from your text list",
    "No more messages please",
    "I don’t want any more texts",
    "Please opt me out",
    "Please take me off your list",
    "Remove my number from your list",
    "Please don't send me any more texts",
    "Stop sending me messages",
    "I don't want to hear from you again",
    "Please unsubscribe",
  ])("recognizes %j", (body) => {
    expect(matchesSmsRevocationRequest(body)).toBe(true);
  });

  it.each([
    "Can you stop by tomorrow?",
    "Please don't stop the updates",
    "Don't text me the price, call me",
    "I don't want more information on prices",
    "Yes please, Tuesday works",
    "Help me reschedule",
    "Cancel my appointment",
    "End the call",
    "Stop by tomorrow",
    "Quit the appointment process",
  ])("leaves an ordinary reply in the inbox: %j", (body) => {
    expect(matchesSmsRevocationRequest(body)).toBe(false);
  });
});
