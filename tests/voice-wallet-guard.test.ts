import { describe, expect, it, vi } from "vitest";

// assertVoiceWalletSolvent() re-fetches the snapshot internally, so each test
// that both reads a snapshot and asserts on the guard needs the
// [sub, usage, settings] rows queued twice (once per getVoiceWalletSnapshot()).
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
      selectSequence([
        [{ plan: null, status: null }],
        [{ used: 0 }],
        [{ extraAgents: 0 }],
      ]) as never,
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
      selectSequence([
        [{ plan: "team", status: "active" }],
        [{ used: 75 }],
        [{ extraAgents: 0 }],
      ]) as never,
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
      selectSequence([
        [{ plan: "team", status: "active" }],
        [{ used: 0 }],
        [{ extraAgents: 0 }],
      ]) as never,
    );
    vi.mocked(getCreditBalanceUsd).mockResolvedValue(0);

    const snapshot = await getVoiceWalletSnapshot("user-1");
    expect(snapshot.sufficient).toBe(true);
    await expect(assertVoiceWalletSolvent("user-1")).resolves.toBeUndefined();
  });

  it("counts paid extra-agent minutes in the included pool", async () => {
    // team base = 75 min; each extra agent adds 50. With 2 extra agents the
    // customer has 175 included, so 75 used still leaves 100 — the call must be
    // allowed even with a zero balance instead of being blocked at the base cap.
    vi.mocked(drizzle.select).mockImplementation(
      selectSequence([
        [{ plan: "team", status: "active" }],
        [{ used: 75 }],
        [{ extraAgents: 2 }],
      ]) as never,
    );
    vi.mocked(getCreditBalanceUsd).mockResolvedValue(0);

    const snapshot = await getVoiceWalletSnapshot("user-1");
    expect(snapshot.included_minutes).toBe(175);
    expect(snapshot.included_minutes_remaining).toBe(100);
    expect(snapshot.sufficient).toBe(true);
    await expect(assertVoiceWalletSolvent("user-1")).resolves.toBeUndefined();
  });
});
