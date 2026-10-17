import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertLiveAllowed: vi.fn(),
  assertPrivateTextAllowed: vi.fn(),
  assertPrivateVoiceAllowed: vi.fn(),
  select: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../src/lib/paid-allowance-period", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/paid-allowance-period")>();
  return { ...actual, resolveAllowanceWindow: vi.fn(async () => actual.calendarAllowanceWindow()) };
});

vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: mocks.assertLiveAllowed,
  assertPrivateTextSimulationAllowed: mocks.assertPrivateTextAllowed,
  assertPrivateVoiceSimulationAllowed: mocks.assertPrivateVoiceAllowed,
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: mocks.select },
  log: { error: mocks.logError, warn: vi.fn() },
}));

vi.mock("../src/lib/daily-spend-accumulator", () => ({
  getDailySpendUsd: vi.fn(async () => 0),
  recordDailySpendUsd: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/webhook-helpers", () => ({
  dispatchWebhook: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/sentry-events", () => ({
  SentryEvents: { budgetExceeded: vi.fn() },
}));

import { AppError } from "../src/lib/api-error";
import { resolveAllowanceWindow } from "../src/lib/paid-allowance-period";
import {
  clearBudgetCache,
  enforceSpendCap,
  enforcePrivateTextSimulationSpendCap,
  enforcePrivateVoiceSimulationSpendCap,
  getBudgetSnapshot,
} from "../src/lib/spend-guards";

function queryResult(rows: Array<Record<string, unknown>>) {
  const result = Promise.resolve(rows);
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(() => result),
    then: result.then.bind(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function installWithinLimitBudget() {
  mocks.select
    .mockReturnValueOnce(
      queryResult([
        {
          monthlyLimitUsd: "1.50",
          hardCap: true,
          warnThresholdPct: 80,
          enabled: true,
        },
      ]),
    )
    .mockReturnValueOnce(queryResult([{ mtdCost: "0.25" }]));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBudgetCache("demo-user");
  clearBudgetCache("missing-user");
  mocks.assertPrivateTextAllowed.mockResolvedValue(undefined);
  mocks.assertPrivateVoiceAllowed.mockResolvedValue(undefined);
  mocks.assertLiveAllowed.mockResolvedValue(undefined);
});

describe("private simulation spend guard", () => {
  it.each([
    ["live", enforceSpendCap],
    ["private text", enforcePrivateTextSimulationSpendCap],
    ["private voice", enforcePrivateVoiceSimulationSpendCap],
  ])("preserves a payment reversal's actionable 402 for %s admission", async (_label, guard) => {
    vi.mocked(resolveAllowanceWindow).mockRejectedValueOnce(
      new AppError(402, "PAID_ALLOWANCE_FUNDING_REVERSED", "Payment needs attention."),
    );
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();
    await guard({ user: { id: "demo-user" } } as never, { status } as never, next);
    expect(status).toHaveBeenCalledWith(402);
    expect(json).toHaveBeenCalledWith({
      code: "PAID_ALLOWANCE_FUNDING_REVERSED",
      error: "Payment needs attention.",
      recovery_path: "/settings/billing",
    });
    expect(next).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns reporting figures and a funding flag without admitting new work", async () => {
    installWithinLimitBudget();
    const actual = await vi.importActual<typeof import("../src/lib/paid-allowance-period")>(
      "../src/lib/paid-allowance-period",
    );
    vi.mocked(resolveAllowanceWindow).mockResolvedValueOnce({
      ...actual.calendarAllowanceWindow(),
      fundingReversed: true,
    });
    await expect(getBudgetSnapshot("demo-user", true, true)).resolves.toMatchObject({
      mtdCost: 0.25,
      funding_blocked: true,
    });
    expect(resolveAllowanceWindow).toHaveBeenLastCalledWith(
      expect.anything(),
      "demo-user",
      expect.any(Date),
      { reportingOnly: true },
    );
  });
  it("admits a classified demo workspace through its persisted cap without the live guard", async () => {
    installWithinLimitBudget();
    const next = vi.fn();
    const status = vi.fn();

    await enforcePrivateTextSimulationSpendCap(
      { user: { id: "demo-user" } } as never,
      { status } as never,
      next,
    );

    expect(mocks.assertPrivateTextAllowed).toHaveBeenCalledWith(
      "demo-user",
      "private_text_simulation",
    );
    expect(mocks.assertLiveAllowed).not.toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("fails closed before budget/provider work when account classification is missing", async () => {
    const unavailable = new AppError(
      503,
      "ACCOUNT_ENVIRONMENT_UNAVAILABLE",
      "Private text simulation is unavailable until this workspace is fully configured.",
    );
    mocks.assertPrivateTextAllowed.mockRejectedValueOnce(unavailable);
    const next = vi.fn();

    await expect(
      enforcePrivateTextSimulationSpendCap(
        { user: { id: "missing-user" } } as never,
        { status: vi.fn() } as never,
        next,
      ),
    ).rejects.toBe(unavailable);

    expect(mocks.select).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe("private voice simulation spend guard", () => {
  it("admits a classified test workspace through its persisted cap without the live guard", async () => {
    installWithinLimitBudget();
    const next = vi.fn();
    const status = vi.fn();

    await enforcePrivateVoiceSimulationSpendCap(
      { user: { id: "demo-user" } } as never,
      { status } as never,
      next,
    );

    expect(mocks.assertPrivateVoiceAllowed).toHaveBeenCalledWith(
      "demo-user",
      "private_voice_simulation",
    );
    expect(mocks.assertLiveAllowed).not.toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("fails closed before budget/provider work when account classification is missing", async () => {
    const unavailable = new AppError(
      503,
      "ACCOUNT_ENVIRONMENT_UNAVAILABLE",
      "Preview Voice is unavailable until this workspace is fully configured.",
    );
    mocks.assertPrivateVoiceAllowed.mockRejectedValueOnce(unavailable);
    const next = vi.fn();

    await expect(
      enforcePrivateVoiceSimulationSpendCap(
        { user: { id: "missing-user" } } as never,
        { status: vi.fn() } as never,
        next,
      ),
    ).rejects.toBe(unavailable);

    expect(mocks.select).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
