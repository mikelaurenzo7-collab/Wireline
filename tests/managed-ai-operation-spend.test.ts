import { describe, expect, it, vi } from "vitest";
import { recordAmbiguousProviderAttempt, recordUsage } from "../src/lib/ai-audit";
import { DefiniteProviderRejectionError } from "../src/lib/ai-client";
import {
  managedAiSettledCostUsd,
  runWithManagedAiSpend,
  type ManagedAiSpendDependencies,
} from "../src/lib/managed-ai-operation-spend";

function setup(allowance = 0.15) {
  let balance = allowance;
  let nextId = 1n;
  const deps: ManagedAiSpendDependencies = {
    preflightTokens: vi.fn(async () => null),
    reserve: vi.fn(async ({ userId, costUsd }) => {
      if (balance < costUsd) return { reserved: false as const, reason: "cap_reached" as const };
      balance -= costUsd;
      return { reserved: true as const, reservation: { auditId: nextId++, userId, costUsd } };
    }),
    release: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    settleKnown: vi.fn(async () => {}),
  };
  return deps;
}
const input = { userId: "tenant", action: "training.training", reserveUsd: 0.1 };
const known = () =>
  recordUsage("gpt-5.6-terra", { usage: { input_tokens: 100, output_tokens: 10 } }, 20);

describe("shared setup spend lifecycle", () => {
  it("admits only the operation that reserved enough remaining allowance during concurrent requests", async () => {
    const deps = setup();
    const provider = vi.fn(async () => {
      await Promise.resolve();
      known();
      return "facts";
    });
    const results = await Promise.allSettled([
      runWithManagedAiSpend({ ...input, operation: provider }, deps),
      runWithManagedAiSpend({ ...input, operation: provider }, deps),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: {
        status: 402,
        code: "SPEND_CAP_REACHED",
        details: { recovery_path: "/settings/billing", required_reserve_usd: 0.1 },
      },
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(deps.settleKnown).toHaveBeenCalledTimes(1);
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it("retains the complete bound when known billed work is followed by an ambiguous attempt", async () => {
    const deps = setup();
    await expect(
      runWithManagedAiSpend(
        {
          ...input,
          operation: async () => {
            known();
            recordAmbiguousProviderAttempt();
            throw new Error("timeout");
          },
        },
        deps,
      ),
    ).rejects.toThrow("timeout");
    expect(deps.settleKnown).toHaveBeenCalledWith(
      expect.objectContaining({ action: "training.training", minimumCostUsd: 0.1 }),
    );
    expect(deps.release).not.toHaveBeenCalled();
  });

  it("releases a definitively free rejection, but never an unknown provider outcome", async () => {
    const free = setup();
    await expect(
      runWithManagedAiSpend(
        {
          ...input,
          operation: async () => {
            throw new DefiniteProviderRejectionError("OpenAI", 429);
          },
        },
        free,
      ),
    ).rejects.toThrow();
    expect(free.release).toHaveBeenCalledTimes(1);
    const unknown = setup();
    await expect(
      runWithManagedAiSpend(
        {
          ...input,
          operation: async () => {
            throw new Error("connection lost");
          },
        },
        unknown,
      ),
    ).rejects.toThrow();
    expect(unknown.commit).toHaveBeenCalledTimes(1);
    expect(unknown.release).not.toHaveBeenCalled();
  });

  it("keeps the durable reserve when final accounting is unavailable without repeating successful provider work", async () => {
    const deps = setup();
    vi.mocked(deps.settleKnown).mockRejectedValue(new Error("database unavailable"));
    const provider = vi.fn(async () => {
      known();
      return "facts";
    });
    await expect(runWithManagedAiSpend({ ...input, operation: provider }, deps)).resolves.toBe(
      "facts",
    );
    expect(provider).toHaveBeenCalledTimes(1);
    expect(deps.commit).toHaveBeenCalledTimes(1);
    expect(deps.release).not.toHaveBeenCalled();
  });

  it("settles Browserless time separately from nested OpenAI turns without double charging", async () => {
    const deps = setup(1);
    await runWithManagedAiSpend(
      {
        userId: "tenant",
        action: "computer.browser",
        reserveUsd: 0.2,
        operation: async () => {
          await runWithManagedAiSpend(
            { ...input, action: "computer.browse", operation: async () => known() },
            deps,
          );
          recordUsage(
            "browserless/session",
            { inference_provider: "browserless", provider_tool_call_cost_usd: 0.004, usage: {} },
            60_000,
          );
        },
      },
      deps,
    );
    expect(deps.settleKnown).toHaveBeenCalledTimes(2);
    const settlements = vi.mocked(deps.settleKnown).mock.calls.map(([settlement]) => settlement);
    const browser = settlements.find((settlement) => settlement.action === "computer.browser");
    const model = settlements.find((settlement) => settlement.action === "computer.browse");
    expect(browser?.records).toEqual([
      expect.objectContaining({
        provider: "browserless",
        provider_tool_call_cost_usd: 0.004,
        input_tokens: 0,
        output_tokens: 0,
      }),
    ]);
    expect(model?.records).toEqual([
      expect.objectContaining({ provider: "openai", input_tokens: 100, output_tokens: 10 }),
    ]);
  });

  it("settles a failed pre-session browser start at zero instead of retaining its reserve", async () => {
    const deps = setup(1);
    await expect(
      runWithManagedAiSpend(
        {
          userId: "tenant",
          action: "computer.browser",
          reserveUsd: 0.2,
          operation: async () => {
            recordUsage(
              "browserless/session",
              { inference_provider: "browserless", provider_tool_call_cost_usd: 0, usage: {} },
              0,
            );
            throw new Error("Browserless did not connect");
          },
        },
        deps,
      ),
    ).rejects.toThrow("Browserless did not connect");
    const settled = vi.mocked(deps.settleKnown).mock.calls[0]?.[0];
    expect(settled?.action).toBe("computer.browser");
    expect(managedAiSettledCostUsd(settled?.records ?? [])).toBe(0);
    expect(deps.commit).not.toHaveBeenCalled();
  });
});
