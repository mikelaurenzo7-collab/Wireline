import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPlainLanguageOptOut, matchesCarrierKeyword } from "../src/lib/carrier-keywords";

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

  it("matches a leading keyword when the rest clearly revokes contact", () => {
    expect(matchesCarrierKeyword(norm("STOP CALLING ME"), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("stop please"), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("cancel these texts please"), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("end - no more texts"), OPT_OUT)).toBe(true);
  });

  it.each([
    "Cancel my appointment",
    "cancel please",
    "End my booking",
    "Stop by Tuesday",
    "Quit the meeting",
  ])("routes an ordinary request %j through the conversation", (body) => {
    expect(matchesCarrierKeyword(norm(body), OPT_OUT)).toBe(false);
    expect(isPlainLanguageOptOut(norm(body))).toBe(false);
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

describe("plain-language opt-outs (FCC: any reasonable means, since April 2025)", () => {
  it.each([
    "please stop texting me",
    "Can you stop sending these?",
    "don't text me again",
    "Do not contact this number",
    "remove me from your list",
    "Take my number off your list",
    "no more texts please",
    "I want to unsubscribe",
    "I want to unsubscribe",
    "leave me alone",
    "Don’t message me",
    "Please stop",
    "Please do not send me text messages",
    "I don't want to receive SMS",
    "Stop receiving messages",
  ])("treats %j as an opt-out", (body) => {
    expect(isPlainLanguageOptOut(body.trim().toLowerCase())).toBe(true);
  });

  it.each([
    "can you stop by tuesday?",
    "please call me back",
    "yes, text me the address",
    "don't stop the appointment",
    "don't stop the texts",
    "do not cancel my messages",
    "I don't want to stop receiving texts",
    "Don't text me the price, call me",
    "How do I opt out?",
    "I don't want texts about this appointment, call me",
    "remove the old filter please",
    "what time do you open?",
  ])("leaves an ordinary reply %j alone", (body) => {
    expect(isPlainLanguageOptOut(body.trim().toLowerCase())).toBe(false);
  });

  it("is checked next to the keyword match on both SMS webhook routes", () => {
    const read = (path: string) => readFileSync(path, "utf8");
    expect(read("src/routes/twilio-webhook.ts")).toContain("isPlainLanguageOptOut(bodyKeyword)");
    expect(read("src/routes/twilio-webhook-base.ts")).toContain("isPlainLanguageOptOut(trimmed)");
  });
});
