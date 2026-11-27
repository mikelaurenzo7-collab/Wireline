import { describe, expect, it } from "vitest";

import { saysPhoneNumber } from "../src/lib/voice/callback-number-spoken";

describe("whether the Bot has said its callback number", () => {
  const number = "+17736949780";

  it("hears it however it was written out", () => {
    for (const said of [
      "You can reach us at seven seven three, six nine four, nine seven eight zero.",
      "Our number is 773-694-9780.",
      "Call (773) 694-9780 any time.",
      "That's seven seven three, then six nine four, then nine seven eight oh.",
      "It's 1 773 694 9780.",
    ]) {
      expect(saysPhoneNumber(said, number), said).toBe(true);
    }
  });

  it("does not hear a number that was not said, or only part of one", () => {
    for (const said of [
      "",
      "Is now a good time?",
      "You can reach us at seven seven three, six nine four.",
      "Call 773-694-9781.",
      "We open at nine and close at five.",
    ]) {
      expect(saysPhoneNumber(said, number), said).toBe(false);
    }
  });

  it("has nothing to listen for without a number", () => {
    expect(saysPhoneNumber("seven seven three", null)).toBe(false);
    expect(saysPhoneNumber("seven seven three", "773")).toBe(false);
  });
});
