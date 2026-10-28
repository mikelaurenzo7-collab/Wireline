import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recordAmbiguousProviderAttempt, recordUsage } from "../src/lib/ai-audit";
import { DefiniteProviderRejectionError, RuntimeUnavailableError } from "../src/lib/ai-client";
import { POSTGRES_INT32_MAX } from "../src/lib/ai-usage";
import { runStructured } from "../src/lib/ai-structured";
import { AppError } from "../src/lib/api-error";
import { WebsiteFetchError } from "../src/lib/safe-public-text-fetch";
import {
  aggregateManagedAiUsage as aggregateWebsiteKnowledgeUsage,
  runWithManagedAiSpend,
  managedAiCostDecision as websiteKnowledgeCostDecision,
  managedAiSettledCostUsd as websiteKnowledgeSettledCostUsd,
  type ManagedAiSpendDependencies,
} from "../src/lib/managed-ai-operation-spend";

// Exercise the shared settlement lifecycle with a deterministic test reservation.
const runWithWebsiteKnowledgeSpend = <T>(
  input: { userId: string; hostname: string; operation: () => Promise<T> },
  dependencies: ManagedAiSpendDependencies,
) =>
  runWithManagedAiSpend(
    { ...input, action: "website-knowledge.import", reserveUsd: 0.25 },
    dependencies,
  );

const reservation = { auditId: 42n, userId: "user-1", costUsd: 0.25 };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureFetchRuntime(): void {
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("XAI_API_KEY", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "openai");
}

const fixtureTool = {
  name: "extract_fixture",
  input_schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
};

function runProviderFixture(): Promise<{ value: string }> {
  return runStructured<{ value: string }>({
    system: "Return the requested fixture.",
    user: "fixture",
    tool: fixtureTool,
    complexity: "simple",
    maxTokens: 50,
  });
}

function providerResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dependencies(
  reserveDecision:
    | { reserved: true; reservation: typeof reservation }
    | {
        reserved: false;
        reason: "cap_reached" | "unavailable";
        period?: string;
        monthToDateUsd?: number;
        monthlyLimitUsd?: number;
      } = { reserved: true, reservation },
) {
  return {
    preflightTokens: vi.fn(async () => null),
    reserve: vi.fn(async () => reserveDecision),
    release: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    settleKnown: vi.fn(async () => undefined),
  };
}

describe("website knowledge spend reservation", () => {
  it("settles against authoritative Gateway cost when it is available", () => {
    expect(
      websiteKnowledgeSettledCostUsd([
        {
          model: "google/gemini-3.6-flash",
          provider: "vertex",
          actual_cost_usd: 0.012345,
          input_tokens: 1,
          output_tokens: 1,
          cache_read_tokens: 0,
          cache_create_tokens: 0,
          latency_ms: 10,
        },
      ]),
    ).toBe(0.012345);
  });

  it("labels a larger ambiguous-attempt floor instead of claiming pure provider cost", () => {
    const record = {
      model: "google/gemini-3.6-flash",
      provider: "vertex",
      actual_cost_usd: 0.012345,
      input_tokens: 1,
      output_tokens: 1,
      cache_read_tokens: 0,
      cache_create_tokens: 0,
      latency_ms: 10,
    };

    expect(websiteKnowledgeCostDecision([record], 0.25)).toEqual({
      costUsd: 0.25,
      costBasis: "provider_reported_with_conservative_ambiguous_floor",
      conservativeFloorApplied: true,
    });
    expect(websiteKnowledgeCostDecision([record], 0.01)).toEqual({
      costUsd: 0.012345,
      costBasis: "provider_reported",
      conservativeFloorApplied: false,
    });
    expect(websiteKnowledgeCostDecision([], 0.25)).toEqual({
      costUsd: 0.25,
      costBasis: "no_known_provider_cost_with_conservative_ambiguous_floor",
      conservativeFloorApplied: true,
    });
  });

  it("settles an authoritative zero charge to zero instead of retaining the reserve", () => {
    const record = {
      model: "openai/gpt-5.6-terra",
      provider: "gateway",
      actual_cost_usd: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_create_tokens: 0,
      latency_ms: 10,
    };

    expect(websiteKnowledgeCostDecision([record])).toEqual({
      costUsd: 0,
      costBasis: "provider_reported",
      conservativeFloorApplied: false,
    });
    const source = readFileSync("src/lib/managed-ai-operation-spend.ts", "utf8");
    const settlement = source.slice(
      source.indexOf("async function settleKnownManagedAiSpend"),
      source.indexOf("function reservationError"),
    );
    expect(settlement).toContain("costUsd: String(costUsd)");
    expect(settlement).not.toContain("commitPlatformCostReservation(input.reservation)");
  });

  it("saturates multi-call usage aggregates before persisting PostgreSQL integers", () => {
    const record = {
      model: "openai/gpt-5.6-terra",
      provider: "gateway",
      actual_cost_usd: 0,
      input_tokens: 2_000_000_000,
      output_tokens: 1_500_000_000,
      cache_read_tokens: 2_000_000_000,
      cache_create_tokens: 2_000_000_000,
      latency_ms: 2_000_000_000,
    };

    expect(aggregateWebsiteKnowledgeUsage([record, record])).toEqual({
      tokenDelta: POSTGRES_INT32_MAX,
      inputTokens: POSTGRES_INT32_MAX,
      outputTokens: POSTGRES_INT32_MAX,
      cacheReadTokens: POSTGRES_INT32_MAX,
      cacheCreateTokens: POSTGRES_INT32_MAX,
      latencyMs: POSTGRES_INT32_MAX,
    });
  });

  it("counts cache usage in the website-import daily token delta", () => {
    expect(
      aggregateWebsiteKnowledgeUsage([
        {
          model: "openai/gpt-5.6-terra",
          provider: "gateway",
          actual_cost_usd: 0,
          input_tokens: 100,
          output_tokens: 20,
          cache_read_tokens: 300,
          cache_create_tokens: 40,
          latency_ms: 10,
        },
      ]),
    ).toEqual({
      tokenDelta: 460,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 300,
      cacheCreateTokens: 40,
      latencyMs: 10,
    });
  });

  it.each(["0x10", "1e308", -0.01, "NaN"])(
    "falls back to catalog pricing for malformed reported cost %s",
    (actualCost) => {
      const baseline = {
        model: "openai/gpt-5.6-terra",
        provider: "gateway",
        input_tokens: 1_000,
        output_tokens: 100,
        cache_read_tokens: 0,
        cache_create_tokens: 0,
        latency_ms: 10,
      };
      expect(
        websiteKnowledgeSettledCostUsd([{ ...baseline, actual_cost_usd: actualCost as number }]),
      ).toBe(websiteKnowledgeSettledCostUsd([baseline]));
    },
  );

  it("refuses provider work before reservation when the daily token quota is exhausted", async () => {
    const deps = dependencies();
    deps.preflightTokens.mockResolvedValueOnce({ limit: 200_000, used: 200_001 });
    const operation = vi.fn(async () => "never");

    await expect(
      runWithWebsiteKnowledgeSpend({ userId: "user-1", hostname: "example.com", operation }, deps),
    ).rejects.toMatchObject<AppError>({
      status: 429,
      code: "AI_TOKEN_QUOTA_EXCEEDED",
      details: {
        limit: 200_000,
        used: 200_001,
        recovery_path: "/settings/billing",
      },
    });
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("refuses the provider operation with a resumable 402 when allowance is exhausted", async () => {
    const deps = dependencies({
      reserved: false,
      reason: "cap_reached",
      period: "2026-08",
      monthToDateUsd: 1.4,
      monthlyLimitUsd: 1.5,
    });
    const operation = vi.fn(async () => "never");

    await expect(
      runWithWebsiteKnowledgeSpend({ userId: "user-1", hostname: "example.com", operation }, deps),
    ).rejects.toMatchObject<AppError>({
      status: 402,
      code: "SPEND_CAP_REACHED",
      details: {
        period: "2026-08",
        monthly_limit_usd: 1.5,
        required_reserve_usd: 0.25,
        recovery_path: "/settings/billing",
      },
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("fails closed before provider work when accounting is unavailable", async () => {
    const deps = dependencies({ reserved: false, reason: "unavailable" });
    const operation = vi.fn(async () => "never");

    await expect(
      runWithWebsiteKnowledgeSpend({ userId: "user-1", hostname: "example.com", operation }, deps),
    ).rejects.toMatchObject<AppError>({
      status: 503,
      code: "SPEND_GUARD_UNAVAILABLE",
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("settles the one durable reservation to measured model usage", async () => {
    const deps = dependencies();

    await expect(
      runWithWebsiteKnowledgeSpend(
        {
          userId: "user-1",
          hostname: "example.com",
          operation: async () => {
            recordUsage(
              "gpt-5.6-luna",
              {
                model: "gpt-5.6-luna",
                usage: { input_tokens: 2_000, output_tokens: 200 },
              },
              123,
            );
            return "saved";
          },
        },
        deps,
      ),
    ).resolves.toBe("saved");

    expect(deps.settleKnown).toHaveBeenCalledOnce();
    expect(deps.settleKnown).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation,
        hostname: "example.com",
        records: [
          expect.objectContaining({
            model: "gpt-5.6-luna",
            input_tokens: 2_000,
            output_tokens: 200,
          }),
        ],
        minimumCostUsd: 0,
      }),
    );
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it("never settles below the conservative hold after an ambiguous failed provider attempt", async () => {
    const deps = dependencies();

    await runWithWebsiteKnowledgeSpend(
      {
        userId: "user-1",
        hostname: "example.com",
        operation: async () => {
          recordAmbiguousProviderAttempt();
          recordUsage(
            "gpt-5.6-luna",
            { model: "gpt-5.6-luna", usage: { input_tokens: 10, output_tokens: 2 } },
            5,
          );
          return "fallback-saved";
        },
      },
      deps,
    );

    expect(deps.settleKnown).toHaveBeenCalledWith(
      expect.objectContaining({ minimumCostUsd: reservation.costUsd }),
    );
    const records = deps.settleKnown.mock.calls[0]?.[0].records || [];
    expect(websiteKnowledgeSettledCostUsd(records, reservation.costUsd)).toBe(reservation.costUsd);
  });

  it("releases the reservation when every configured provider explicitly rejects with 401", async () => {
    configureFetchRuntime();
    const fetchMock = vi.fn(async () => providerResponse(401, { error: "unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);
    const deps = dependencies();

    await expect(
      runWithWebsiteKnowledgeSpend(
        {
          userId: "user-1",
          hostname: "example.com",
          operation: runProviderFixture,
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(DefiniteProviderRejectionError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.settleKnown).not.toHaveBeenCalled();
  });

  it("settles only actual fallback usage after a 401 rejection", async () => {
    configureFetchRuntime();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(
        providerResponse(200, {
          output_text: JSON.stringify({ value: "fallback-ok" }),
          usage: { input_tokens: 120, output_tokens: 12 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const deps = dependencies();

    await expect(
      runWithWebsiteKnowledgeSpend(
        {
          userId: "user-1",
          hostname: "example.com",
          operation: runProviderFixture,
        },
        deps,
      ),
    ).resolves.toEqual({ value: "fallback-ok" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deps.settleKnown).toHaveBeenCalledWith(
      expect.objectContaining({
        minimumCostUsd: 0,
        records: [expect.objectContaining({ provider: "gateway" })],
      }),
    );
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it("keeps the hold when a final 401 follows an earlier ambiguous attempt", async () => {
    const deps = dependencies();
    const rejection = new DefiniteProviderRejectionError("OpenAI", 401);

    await expect(
      runWithWebsiteKnowledgeSpend(
        {
          userId: "user-1",
          hostname: "example.com",
          operation: async () => {
            recordAmbiguousProviderAttempt();
            throw rejection;
          },
        },
        deps,
      ),
    ).rejects.toBe(rejection);

    expect(deps.commit).toHaveBeenCalledWith(reservation);
    expect(deps.release).not.toHaveBeenCalled();
  });

  it.each([
    new WebsiteFetchError("upstream_status", "Website rejected the request.", 422),
    new RuntimeUnavailableError(),
  ])("releases on a definitive no-provider failure (%s)", async (failure) => {
    const deps = dependencies();

    await expect(
      runWithWebsiteKnowledgeSpend(
        {
          userId: "user-1",
          hostname: "example.com",
          operation: async () => {
            throw failure;
          },
        },
        deps,
      ),
    ).rejects.toBe(failure);

    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.settleKnown).not.toHaveBeenCalled();
  });

  it("retains the conservative hold when a provider outcome is ambiguous", async () => {
    const deps = dependencies();
    const ambiguous = new Error("connection ended without usage");

    await expect(
      runWithWebsiteKnowledgeSpend(
        {
          userId: "user-1",
          hostname: "example.com",
          operation: async () => {
            throw ambiguous;
          },
        },
        deps,
      ),
    ).rejects.toBe(ambiguous);

    expect(deps.commit).toHaveBeenCalledWith(reservation);
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.settleKnown).not.toHaveBeenCalled();
  });

  it("retains the durable hold without double-writing when actual settlement fails", async () => {
    const deps = dependencies();
    deps.settleKnown.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      runWithWebsiteKnowledgeSpend(
        {
          userId: "user-1",
          hostname: "example.com",
          operation: async () => {
            recordUsage(
              "gpt-5.6-luna",
              { model: "gpt-5.6-luna", usage: { input_tokens: 100, output_tokens: 20 } },
              10,
            );
            return "saved";
          },
        },
        deps,
      ),
    ).resolves.toBe("saved");

    expect(deps.settleKnown).toHaveBeenCalledOnce();
    expect(deps.commit).toHaveBeenCalledWith(reservation);
    expect(deps.release).not.toHaveBeenCalled();
  });
});
