import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  jobs: [] as Array<{
    id: string;
    userId: string;
    status: string;
    payload: Record<string, unknown>;
    result?: { finalization?: { state?: string } } | null;
  }>,
  queries: [] as Array<{ table: string; sql: string; params: unknown[] }>,
  confirm: vi.fn(),
  replay: vi.fn(),
  carrierCleanup: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  tenantStore: { exit: (work: () => unknown) => work() },
}));
vi.mock("../src/lib/server-utils", () => ({ getErrorMessage: String }));
vi.mock("../src/lib/account-deletion-billing", () => ({
  expireOpenCheckoutSessionsForDeletion: vi.fn(async () => ({
    confirmed: true,
    expired: 0,
    customerIds: [],
  })),
}));
vi.mock("../src/lib/voice/openai-sip-session", () => ({
  confirmOpenAISipHangupRecovery: h.confirm,
  replayOpenAISipPostCallFinalization: h.replay,
}));
vi.mock("../src/lib/orphan-carrier-retry", () => ({
  reconcileNativeTwilioPurchaseClaimsForTerminalDeletion: h.carrierCleanup,
}));
vi.mock("../src/lib/oauth-provider-revocation", () => ({
  revokeAllOAuthGrantsForUser: vi.fn(async () => ({ attempted: 0, revoked: 0, errors: [] })),
}));

import {
  releaseExternalResourcesForPurge,
  type PurgeAccountDeps,
} from "../src/lib/account-deletion";
import { runTerminalDeletionSequence } from "../src/lib/account-deletion-fence";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const dialect = new PgDialect();
const deps = {
  db: {
    select: () => {
      let table: string;
      let query: { sql: string; params: unknown[] };
      const builder = {
        from: (source: Table) => {
          table = getTableName(source);
          return builder;
        },
        where: (condition: SQL) => {
          query = dialect.sqlToQuery(condition);
          h.queries.push({ table, ...query });
          return builder;
        },
        limit: () => builder,
        then: (resolve: (rows: unknown[]) => unknown) => {
          const rows =
            table === "wireline_jobs" && query.params.includes("post_call_digest")
              ? h.jobs.filter((job) => {
                  const finalization = job.payload.finalization;
                  const skipsCompleted = query.sql.includes(
                    `"wireline_jobs"."result"->'finalization'->>'state' IS DISTINCT FROM 'completed'`,
                  );
                  return (
                    job.userId === query.params[0] &&
                    finalization &&
                    typeof finalization === "object" &&
                    "providerHangupRequired" in finalization &&
                    (!skipsCompleted || job.result?.finalization?.state !== "completed")
                  );
                })
              : [];
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
  },
  log: { warn: vi.fn(), error: vi.fn() },
} as unknown as PurgeAccountDeps;

function payload(callLogId = "42"): Record<string, unknown> {
  return {
    userId: USER_ID,
    callLogId,
    finalization: {
      provider: "openai_sip",
      callId: `rtc_${callLogId}`,
      terminalStateReady: true,
      openingPlaybackConfirmed: false,
      providerHangupRequired: true,
    },
  };
}

beforeEach(() => {
  h.jobs = [];
  h.queries = [];
  h.confirm.mockReset().mockResolvedValue(undefined);
  h.replay.mockReset();
  h.carrierCleanup.mockReset().mockResolvedValue({ attempted: 0 });
});

describe("terminal deletion drains durable SIP hangup obligations", () => {
  it("includes pending, failed and done jobs before erasure and retains tenant scope", async () => {
    h.jobs = ["pending", "failed", "done"].map((status, index) => ({
      id: `job-${index}`,
      userId: USER_ID,
      status,
      payload: payload(String(index + 1)),
    }));
    h.jobs.push({ id: "foreign", userId: "another-user", status: "pending", payload: payload() });
    const result = await releaseExternalResourcesForPurge(USER_ID, deps);

    expect(h.confirm.mock.calls.map(([input]) => input)).toEqual(
      [1, 2, 3].map((id) => ({
        userId: USER_ID,
        callLogId: String(id),
        callId: `rtc_${id}`,
      })),
    );
    expect(result.openaiSipHangupObligationsReconciled).toBe(3);
    expect(h.replay).not.toHaveBeenCalled();
    const query = h.queries.find((item) => item.params.includes("post_call_digest"))!;
    expect(query.params).toEqual([USER_ID, "post_call_digest"]);
    expect(query.sql).toContain('"wireline_jobs"."user_id" = $1');
    expect(query.sql).toContain("? 'providerHangupRequired'");
    expect(query.sql).not.toContain('"status"');
    expect(h.confirm.mock.invocationCallOrder.at(-1)).toBeLessThan(
      h.carrierCleanup.mock.invocationCallOrder[0],
    );
  });

  it("ignores explicitly cleared obligations and legacy digest payloads", async () => {
    const cleared = payload();
    (cleared.finalization as Record<string, unknown>).providerHangupRequired = false;
    h.jobs = [
      { id: "cleared", userId: USER_ID, status: "done", payload: cleared },
      { id: "legacy", userId: USER_ID, status: "pending", payload: { userId: USER_ID } },
    ];
    const result = await releaseExternalResourcesForPurge(USER_ID, deps);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(result.openaiSipHangupObligationsReconciled).toBe(0);
  });

  it("skips completed finalization checkpoints but still drains done jobs without one", async () => {
    h.jobs = [
      {
        id: "confirmed",
        userId: USER_ID,
        status: "done",
        payload: payload("41"),
        result: { finalization: { state: "completed" } },
      },
      { id: "deletion-fenced", userId: USER_ID, status: "done", payload: payload("42") },
    ];

    const result = await releaseExternalResourcesForPurge(USER_ID, deps);

    expect(h.confirm).toHaveBeenCalledExactlyOnceWith({
      userId: USER_ID,
      callLogId: "42",
      callId: "rtc_42",
    });
    expect(result.openaiSipHangupObligationsReconciled).toBe(1);
    expect(h.replay).not.toHaveBeenCalled();
    const query = h.queries.find((item) => item.params.includes("post_call_digest"))!;
    expect(query.sql).toContain(
      `"wireline_jobs"."result"->'finalization'->>'state' IS DISTINCT FROM 'completed'`,
    );
    expect(query.sql).not.toContain('"status"');
  });

  it.each([
    { userId: "another-user" },
    { callLogId: "not-a-row" },
    { finalization: { provider: "openai_sip", providerHangupRequired: true } },
    { finalization: { ...(payload().finalization as object), providerHangupRequired: "true" } },
    { finalization: { ...(payload().finalization as object), terminalStateReady: false } },
    { finalization: { ...(payload().finalization as object), callId: "   " } },
  ])("defers purge for malformed or mismatched obligation metadata %j", async (invalid) => {
    h.jobs = [
      { id: "invalid", userId: USER_ID, status: "done", payload: { ...payload(), ...invalid } },
    ];
    await expect(releaseExternalResourcesForPurge(USER_ID, deps)).rejects.toThrow("invalid");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.carrierCleanup).not.toHaveBeenCalled();
  });

  it.each(["provider timeout", "call identity mismatch", "call is not terminal"])(
    "does not erase local pointers when the authoritative guard rejects: %s",
    async (reason) => {
      h.jobs = [{ id: "owed", userId: USER_ID, status: "done", payload: payload() }];
      h.confirm.mockRejectedValueOnce(new Error(reason));
      const erase = vi.fn();
      await expect(
        runTerminalDeletionSequence({
          establishTerminalState: async () => ({ userId: USER_ID, status: "purging" }),
          releaseExternalResources: () => releaseExternalResourcesForPurge(USER_ID, deps),
          purgeLocalAccount: erase,
        }),
      ).rejects.toThrow(reason);
      expect(erase).not.toHaveBeenCalled();
      expect(h.carrierCleanup).not.toHaveBeenCalled();
      expect(h.jobs).toHaveLength(1);
    },
  );
});
