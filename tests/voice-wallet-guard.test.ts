import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ plan: null }]),
        })),
      })),
    })),
  },
}));

vi.mock("../src/lib/credit-wallet", () => ({
  getCreditBalanceUsd: vi.fn(),
}));

import { getCreditBalanceUsd } from "../src/lib/credit-wallet";
import { assertVoiceWalletSolvent, getVoiceWalletSnapshot } from "../src/lib/voice-wallet-guard";

describe("voice-wallet-guard", () => {
  it("requires Conversation Balance for pay-as-you-go tenants", async () => {
    vi.mocked(getCreditBalanceUsd).mockResolvedValue(0);
    const snapshot = await getVoiceWalletSnapshot("user-1");
    expect(snapshot.is_pay_as_you_go).toBe(true);
    expect(snapshot.sufficient).toBe(false);
    await expect(assertVoiceWalletSolvent("user-1")).rejects.toMatchObject({
      status: 402,
      body: expect.objectContaining({ code: "INSUFFICIENT_BALANCE" }),
    });
  });

  it("passes when pay-as-you-go balance covers one minute", async () => {
    vi.mocked(getCreditBalanceUsd).mockResolvedValue(5);
    const snapshot = await getVoiceWalletSnapshot("user-1");
    expect(snapshot.sufficient).toBe(true);
    await expect(assertVoiceWalletSolvent("user-1")).resolves.toBeUndefined();
  });
});
