import { beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.resetModules();
});

async function loadModules() {
  vi.doMock("../src/lib/server-context", () => ({
    drizzle: { select: vi.fn() },
    serialQueryBatch: async (queries: readonly unknown[]) => {
      const rows: unknown[] = [];
      for (const query of queries) rows.push(await query);
      return rows;
    },
  }));
  vi.doMock("../src/lib/credit-wallet", () => ({
    getCreditBalanceUsd: vi.fn(),
  }));
  const { drizzle } = await import("../src/lib/server-context");
  const { getCreditBalanceUsd } = await import("../src/lib/credit-wallet");
  const { assertVoiceWalletSolvent, getVoiceWalletSnapshot } =
    await import("../src/lib/voice-wallet-guard");
  return { drizzle, getCreditBalanceUsd, assertVoiceWalletSolvent, getVoiceWalletSnapshot };
}

describe("voice-wallet-guard", () => {
  it("requires a paid plan before any live voice work", async () => {
    const { drizzle, getCreditBalanceUsd, assertVoiceWalletSolvent, getVoiceWalletSnapshot } =
      await loadModules();
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
    const { drizzle, getCreditBalanceUsd, assertVoiceWalletSolvent, getVoiceWalletSnapshot } =
      await loadModules();
    vi.mocked(drizzle.select).mockImplementation(
      selectSequence([
        [{ plan: "team", status: "active" }],
        [{ used: 120 }],
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
    const { drizzle, getCreditBalanceUsd, assertVoiceWalletSolvent, getVoiceWalletSnapshot } =
      await loadModules();
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

  it("fails closed when the stored plan id no longer resolves in the catalog", async () => {
    const { drizzle, getCreditBalanceUsd, assertVoiceWalletSolvent, getVoiceWalletSnapshot } =
      await loadModules();
    const { FLAT_OVERAGE_PER_MIN_USD } = await import("../src/lib/plan-catalog");
    // A catalog rotation that orphans a stored plan id must not pass the old
    // `planId !== "personal"` check on a null plan: that combination handed
    // live voice to a tenant whose overage the ledger priced at $0.
    vi.mocked(drizzle.select).mockImplementation(
      selectSequence([
        [{ plan: "retired-plan-id", status: "active" }],
        [{ used: 0 }],
        [{ extraAgents: 0 }],
      ]) as never,
    );
    vi.mocked(getCreditBalanceUsd).mockResolvedValue(50);

    const snapshot = await getVoiceWalletSnapshot("user-1");
    expect(snapshot.live_voice_enabled).toBe(false);
    expect(snapshot.minute_rate_usd).toBe(FLAT_OVERAGE_PER_MIN_USD);
    expect(snapshot.sufficient).toBe(false);
    await expect(assertVoiceWalletSolvent("user-1")).rejects.toMatchObject({
      status: 402,
      body: expect.objectContaining({ code: "LIVE_PLAN_REQUIRED" }),
    });
  });

  it("counts paid extra-agent minutes in the included pool", async () => {
    const { drizzle, getCreditBalanceUsd, assertVoiceWalletSolvent, getVoiceWalletSnapshot } =
      await loadModules();
    // team base = 100 min; each extra agent adds 50. With 2 extra agents the
    // customer has 200 included, so 75 used still leaves 125 — the call must be
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
    expect(snapshot.included_minutes).toBe(200);
    expect(snapshot.included_minutes_remaining).toBe(125);
    expect(snapshot.sufficient).toBe(true);
    await expect(assertVoiceWalletSolvent("user-1")).resolves.toBeUndefined();
  });
});
