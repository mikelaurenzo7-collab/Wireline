import { describe, expect, it, vi } from "vitest";

// assertVoiceWalletSolvent() re-fetches the snapshot internally, so each test
// that both reads a snapshot and asserts on the guard needs the [sub, usage]
// pair queued twice (once per getVoiceWalletSnapshot() call).
function selectSequence(rowsPerCall: unknown[][], repeat = 2) {
  const impl = vi.fn();
  for (let i = 0; i < repeat; i++) {
    for (const rows of rowsPerCall) {
      impl.mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            limit: async () => rows,
          }),
        }),
      }));
    }
  }
  return impl;
}

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: vi.fn() },
}));

vi.mock("../src/lib/credit-wallet", () => ({
  getCreditBalanceUsd: vi.fn(),
}));

import { drizzle } from "../src/lib/server-context";
import { getCreditBalanceUsd } from "../src/lib/credit-wallet";
import { assertVoiceWalletSolvent, getVoiceWalletSnapshot } from "../src/lib/voice-wallet-guard";

describe("voice-wallet-guard", () => {
  it("requires a paid plan before any live voice work", async () => {
    vi.mocked(drizzle.select).mockImplementation(
      selectSequence([[{ plan: null, status: null }], [{ used: 0 }]]) as never,
    );
    vi.mocked(getCreditBalanceUsd).mockResolvedValue(50);

    const snapshot = await getVoiceWalletSnapshot("user-1");
    expect(snapshot.live_voice_enabled).toBe(false);
    expect(snapshot.sufficient).toBe(false);
    await expect(assertVoiceWalletSolvent("user-1")).rejects.toMatchObject({
      status: 402,
      body: expect.objectContaining({ code: "LIVE_PLAN_REQUIRED" }),
    });
  });

  it("blocks a paid plan whose included minutes and balance are both depleted", async () => {
    vi.mocked(drizzle.select).mockImplementation(
      selectSequence([[{ plan: "team", status: "active" }], [{ used: 75 }]]) as never,
    );
    vi.mocked(getCreditBalanceUsd).mockResolvedValue(0);

    const snapshot = await getVoiceWalletSnapshot("user-1");
    expect(snapshot.live_voice_enabled).toBe(true);
    expect(snapshot.included_minutes_remaining).toBe(0);
    expect(snapshot.sufficient).toBe(false);
    await expect(assertVoiceWalletSolvent("user-1")).rejects.toMatchObject({
      status: 402,
      body: expect.objectContaining({ code: "VOICE_COVERAGE_DEPLETED" }),
    });
  });

  it("passes for a paid plan with included minutes remaining", async () => {
    vi.mocked(drizzle.select).mockImplementation(
      selectSequence([[{ plan: "team", status: "active" }], [{ used: 0 }]]) as never,
    );
    vi.mocked(getCreditBalanceUsd).mockResolvedValue(0);

    const snapshot = await getVoiceWalletSnapshot("user-1");
    expect(snapshot.sufficient).toBe(true);
    await expect(assertVoiceWalletSolvent("user-1")).resolves.toBeUndefined();
  });
});
