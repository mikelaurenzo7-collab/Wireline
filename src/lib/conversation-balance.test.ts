import { describe, expect, it } from "vitest";
import {
  CONVERSATION_BALANCE_MAX_USD,
  CONVERSATION_BALANCE_MIN_USD,
  CONVERSATION_BALANCE_PRESETS_USD,
  isConversationBalanceAmount,
} from "./conversation-balance";

describe("Conversation Balance product contract", () => {
  it("starts at the approved $5 floor with a simple preset ladder", () => {
    expect(CONVERSATION_BALANCE_MIN_USD).toBe(5);
    expect([...CONVERSATION_BALANCE_PRESETS_USD]).toEqual([5, 10, 25, 50]);
  });

  it("accepts whole-dollar top-ups only within the safe bounds", () => {
    expect(isConversationBalanceAmount(5)).toBe(true);
    expect(isConversationBalanceAmount(CONVERSATION_BALANCE_MAX_USD)).toBe(true);
    expect(isConversationBalanceAmount(4)).toBe(false);
    expect(isConversationBalanceAmount(5.5)).toBe(false);
    expect(isConversationBalanceAmount(CONVERSATION_BALANCE_MAX_USD + 1)).toBe(false);
  });
});
