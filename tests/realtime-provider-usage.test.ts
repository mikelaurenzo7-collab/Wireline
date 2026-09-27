import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: {} as Record<string, any>,
  receipts: new Map<string, Record<string, any>>(),
  failUpdate: false,
  telemetry: vi.fn(),
  locks: [] as string[],
  tail: Promise.resolve() as Promise<unknown>,
}));
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
}));
vi.mock("../src/db/schema", () => ({
  auditLog: {
    __name: "audit",
    id: "id",
    userId: "userId",
    action: "action",
    provider: "provider",
    idempotencyKey: "idempotencyKey",
    costUsd: "costUsd",
    inputTokens: "inputTokens",
    outputTokens: "outputTokens",
    cacheReadTokens: "cacheReadTokens",
    metadata: "metadata",
  },
  spendBudgets: { __name: "budget", userId: "userId" },
}));
vi.mock("../src/lib/provider-spend-meter", () => ({
  providerSpendMeter: (row: any) =>
    row.action === "voice.realtime.session" &&
    row.provider === "openai" &&
    row.metadata?.surface === "openai_sip"
      ? "live_voice"
      : "managed_ai",
}));
vi.mock("../src/lib/spend-guards", () => ({
  clearBudgetCache: vi.fn(),
  recordDailySpend: h.telemetry,
}));
vi.mock("../src/lib/server-context", () => {
  const matches = (filter: any): boolean =>
    Array.isArray(filter) && typeof filter[0] === "string"
      ? h.row[filter[0]] === filter[1]
      : (filter || []).every(matches);
  const query = (operation: string, source?: { __name: string }) => {
    let table = source?.__name;
    let values: any;
    let filter: any;
    const chain: any = {
      from(value: { __name: string }) {
        table = value.__name;
        return chain;
      },
      where(value: any) {
        filter = value;
        return chain;
      },
      limit() {
        return chain;
      },
      for(mode: string) {
        h.locks.push(`${table}:${mode}`);
        return chain;
      },
      values(value: any) {
        values = value;
        return chain;
      },
      set(value: any) {
        values = value;
        return chain;
      },
      onConflictDoNothing() {
        return chain;
      },
      returning() {
        return chain;
      },
      then(resolve: any, reject: any) {
        return Promise.resolve()
          .then(() => {
            if (operation === "insert") {
              const key = `${values.userId}:${values.action}:${values.idempotencyKey}`;
              if (h.receipts.has(key)) return [];
              h.receipts.set(key, values);
              return [{ id: 100n }];
            }
            if (table === "budget") return [{ userId: "tenant" }];
            if (!matches(filter)) return [];
            if (operation === "update") {
              if (h.failUpdate) throw new Error("database interruption");
              h.row = { ...h.row, ...values };
            }
            return [h.row];
          })
          .then(resolve, reject);
      },
    };
    return chain;
  };
  const tx = {
    select: () => query("select"),
    insert: (table: any) => query("insert", table),
    update: (table: any) => query("update", table),
  };
  return {
    log: { warn: vi.fn(), error: vi.fn() },
    drizzle: {
      transaction(fn: (tx: unknown) => Promise<unknown>) {
        const promise = h.tail.then(async () => {
          const before = structuredClone(h.row);
          const receipts = new Map(h.receipts);
          try {
            return await fn(tx);
          } catch (error) {
            h.row = before;
            h.receipts = receipts;
            throw error;
          }
        });
        h.tail = promise.catch(() => undefined);
        return promise;
      },
    },
  };
});

import {
  createRealtimeUsageRecorder,
  persistRealtimeProviderUsage,
} from "../src/lib/realtime-provider-usage";
const reservation = { auditId: 10n, userId: "tenant", costUsd: 1 };
const usage = {
  key: "response:resp_1",
  kind: "response" as const,
  model: "gpt-realtime-2.1",
  costUsd: 0.6,
  inputTokens: 100,
  outputTokens: 30,
  cacheReadTokens: 20,
  details: { input_audio: 100 },
};
beforeEach(() => {
  h.row = {
    id: 10n,
    userId: "tenant",
    action: "voice.realtime.session",
    provider: "openai",
    idempotencyKey: "openai-sip:call_1",
    costUsd: "1",
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    metadata: { surface: "openai_sip", accounting_state: "committed", reserve_window_usd: 1 },
  };
  h.receipts.clear();
  h.failUpdate = false;
  h.telemetry.mockClear();
  h.locks = [];
  h.tail = Promise.resolve();
});

describe("durable SIP observed-usage accounting", () => {
  it("deduplicates provider replay while preserving the duration floor", async () => {
    await persistRealtimeProviderUsage(reservation, "call_1", usage);
    await persistRealtimeProviderUsage(reservation, "call_1", usage);
    expect(h.row.costUsd).toBe("1");
    expect(h.row.inputTokens).toBe(100);
    expect(h.row.metadata.provider_usage_observed).toMatchObject({
      total_cost_usd: 0.6,
      event_count: 1,
      response_cost_usd: 0.6,
      coverage: "partial_sideband",
    });
    expect(h.receipts.size).toBe(1);
    expect([...h.receipts.values()][0]).toMatchObject({
      costUsd: "0",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(h.telemetry).not.toHaveBeenCalled();
    expect(h.locks.slice(0, 2)).toEqual(["budget:update", "audit:update"]);
  });
  it("adds transcription once and raises COGS only above the retained floor", async () => {
    await persistRealtimeProviderUsage(reservation, "call_1", usage);
    await persistRealtimeProviderUsage(reservation, "call_1", {
      ...usage,
      key: "transcription:item_1:0",
      kind: "transcription",
      model: "gpt-4o-mini-transcribe",
    });
    expect(h.row.costUsd).toBe("1.2");
    expect(h.row.metadata.provider_usage_observed).toMatchObject({
      total_cost_usd: 1.2,
      response_cost_usd: 0.6,
      transcription_cost_usd: 0.6,
      event_count: 2,
    });
    expect(h.telemetry).toHaveBeenCalledWith(expect.closeTo(0.2));
  });
  it.each(["tenant", "call", "surface", "action"])(
    "rejects wrong %s binding before inserting a receipt",
    async (binding) => {
      if (binding === "tenant") h.row.userId = "other";
      if (binding === "call") h.row.idempotencyKey = "openai-sip:other";
      if (binding === "surface") h.row.metadata.surface = "studio_simulation";
      if (binding === "action") h.row.action = "unrelated";
      await expect(persistRealtimeProviderUsage(reservation, "call_1", usage)).rejects.toThrow(
        "does not match",
      );
      expect(h.receipts.size).toBe(0);
    },
  );
  it("rolls back the dedup receipt if aggregate persistence fails, so retry can account it", async () => {
    h.failUpdate = true;
    await expect(persistRealtimeProviderUsage(reservation, "call_1", usage)).rejects.toThrow(
      "interruption",
    );
    expect(h.receipts.size).toBe(0);
    h.failUpdate = false;
    await persistRealtimeProviderUsage(reservation, "call_1", usage);
    expect(h.row.inputTokens).toBe(100);
  });
  it("recovers a missed initial commit once without adding its reserve twice", async () => {
    h.row.metadata.accounting_state = "provider_outcome_ambiguous";
    await persistRealtimeProviderUsage(reservation, "call_1", usage);
    await persistRealtimeProviderUsage(reservation, "call_1", usage);
    expect(h.row.metadata.accounting_state).toBe("committed");
    expect(h.telemetry).toHaveBeenCalledExactlyOnceWith(1);
  });
  it("retries a lost database response without delaying the conversation observer", async () => {
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(undefined);
    const recorder = createRealtimeUsageRecorder(
      reservation,
      "call_1",
      "gpt-4o-mini-transcribe",
      persist,
    );
    recorder.observe({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_1",
      usage: { type: "tokens", input_tokens: 80, output_tokens: 20 },
    });
    await recorder.flush();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1][2]).toMatchObject({ key: "transcription:item_1:0" });
  });
});
