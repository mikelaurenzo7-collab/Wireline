import { describe, expect, it } from "vitest";
import {
  CONVERSATION_BALANCE_MAX_USD,
  CONVERSATION_BALANCE_MIN_USD,
  CONVERSATION_BALANCE_PRESETS_USD,
  isConversationBalanceAmount,
} from "./conversation-balance";

describe("Conversation Balance product contract", () => {
  it("starts at the approved $10 floor with a simple preset ladder", () => {
    expect(CONVERSATION_BALANCE_MIN_USD).toBe(10);
    expect([...CONVERSATION_BALANCE_PRESETS_USD]).toEqual([10, 25, 50, 100]);
  });

  it("accepts whole-dollar top-ups only within the safe bounds", () => {
    expect(isConversationBalanceAmount(10)).toBe(true);
    expect(isConversationBalanceAmount(CONVERSATION_BALANCE_MAX_USD)).toBe(true);
    expect(isConversationBalanceAmount(9)).toBe(false);
    expect(isConversationBalanceAmount(10.5)).toBe(false);
    expect(isConversationBalanceAmount(CONVERSATION_BALANCE_MAX_USD + 1)).toBe(false);
  });
});
