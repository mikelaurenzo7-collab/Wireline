import { describe, expect, it } from "vitest";

import { pronunciationRewriter } from "../src/lib/voice/pronunciation-text";

describe("pronunciations for speech engines that take no list of their own", () => {
  const say = pronunciationRewriter([
    { word: "Acme", say: "Ack-mee" },
    { word: "Acme Mobile", say: "Ack-mee Mo-bull" },
    { word: "Nguyen", say: "Win" },
    { word: "C++", say: "see plus plus" },
    { word: "Zoë", say: "Zo-ee" },
  ]);

  it("swaps whole words only, whatever their capitals", () => {
    expect(say("Ask for NGUYEN, or nguyen's assistant.")).toBe("Ask for Win, or Win's assistant.");
    expect(say("(Acme) is open. acme.")).toBe("(Ack-mee) is open. Ack-mee.");
    // Part of a longer word is another word.
    expect(say("Acmes and Nguyens are unchanged.")).toBe("Acmes and Nguyens are unchanged.");
    expect(say("Acme2 is unchanged too.")).toBe("Acme2 is unchanged too.");
  });

  it("prefers the longest entry when two begin the same way", () => {
    expect(say("Welcome to Acme Mobile, part of Acme.")).toBe(
      "Welcome to Ack-mee Mo-bull, part of Ack-mee.",
    );
  });

  it("treats punctuation and accents in an entry as plain text", () => {
    expect(say("We write C++ daily.")).toBe("We write see plus plus daily.");
    expect(say("Zoë will call back.")).toBe("Zo-ee will call back.");
  });

  it("leaves the text alone when a Bot has no pronunciations", () => {
    const text = "Nothing to change in Acme Mobile.";
    expect(pronunciationRewriter([])(text)).toBe(text);
  });
});
