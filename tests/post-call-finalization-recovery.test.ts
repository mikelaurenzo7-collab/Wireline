import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueuePostCallFinalizationRecovery,
  parsePostCallSipFinalization,
  postCallFinalizationRecoveryEligibility,
  postCallFinalizationRecoveryId,
  POST_CALL_FINALIZATION_RECOVERY_MAX_ATTEMPTS,
  POST_CALL_FINALIZATION_RECOVERY_TYPE,
  recoveryParentId,
} from "../src/lib/post-call-finalization-recovery";

const userId = "11111111-1111-4111-8111-111111111111";
const parentId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const finalization = {
  provider: "openai_sip",
  callId: "rtc_example",
  openingPlaybackConfirmed: true,
  terminalStateReady: true,
  providerHangupRequired: true,
};
function parent() {
  return {
    id: parentId,
    userId,
    type: "post_call_digest",
    status: "dead",
    attempts: 5,
    maxAttempts: 5,
    result: {},
    payload: { userId, callLogId: "42", finalization },
  };
}

function transaction(rows: unknown[][], conflict = false) {
  const pending = [...rows];
  const events: string[] = [];
  const conditions: unknown[] = [];
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    execute: vi.fn(async () => {
      events.push("deletion_fence");
    }),
    select: vi.fn(() => {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: (condition: unknown) => {
          conditions.push(condition);
          return query;
        },
        limit: () => query,
        for: () => {
          events.push("parent_lock");
          return query;
        },
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(pending.shift() ?? []).then(resolve),
      };
      return query;
    }),
    insert: vi.fn(() => {
      const query = {
        values: (value: Record<string, unknown>) => {
          inserted.push(value);
          return query;
        },
        onConflictDoNothing: vi.fn(() => query),
        returning: async () => (conflict ? [] : [{ id: inserted[0].id }]),
      };
      return query;
    }),
  };
  return {
    tx: tx as unknown as Parameters<typeof enqueuePostCallFinalizationRecovery>[0],
    events,
    conditions,
    inserted,
    raw: tx,
  };
}

describe("bounded critical post-call recovery planning", () => {
  it("accepts only unfinished dead original SIP work and keeps parent history untouched", () => {
    const row = parent();
    const before = JSON.stringify(row);
    expect(postCallFinalizationRecoveryEligibility(row)).toEqual({
      eligible: true,
      userId,
      parentJobId: parentId,
      callLogId: "42",
      finalization,
    });
    expect(JSON.stringify(row)).toBe(before);
  });
  it.each(["pending", "running", "done", "failed"])("rejects %s original jobs", (status) => {
    expect(postCallFinalizationRecoveryEligibility({ ...parent(), status }).eligible).toBe(false);
  });
  it("never creates a recovery child of another recovery child", () => {
    expect(
      postCallFinalizationRecoveryEligibility({
        ...parent(),
        type: POST_CALL_FINALIZATION_RECOVERY_TYPE,
      }).eligible,
    ).toBe(false);
    expect(
      postCallFinalizationRecoveryEligibility({
        ...parent(),
        payload: { ...parent().payload, criticalRecoveryOf: otherId },
      }).eligible,
    ).toBe(false);
  });
  it("does not retry optional digest failure after finalization completed", () => {
    expect(
      postCallFinalizationRecoveryEligibility({
        ...parent(),
        result: { finalization: { state: "completed" } },
      }),
    ).toMatchObject({ eligible: false, reason: "finalization_already_completed" });
  });
  it.each([{ userId: otherId }, { userId: undefined }, { userId: userId, user_id: otherId }])(
    "rejects conflicting/missing immutable parent owner %j",
    (owner) => {
      expect(postCallFinalizationRecoveryEligibility({ ...parent(), ...owner }).eligible).toBe(
        false,
      );
    },
  );
  it.each([undefined, "", "0", "-1", "9223372036854775808", "42;drop", 42])(
    "rejects invalid call id %s",
    (callLogId) => {
      expect(
        postCallFinalizationRecoveryEligibility({
          ...parent(),
          payload: { ...parent().payload, callLogId },
        }).eligible,
      ).toBe(false);
    },
  );
  it("requires a matching explicit digest payload owner", () => {
    expect(
      postCallFinalizationRecoveryEligibility({
        ...parent(),
        payload: { ...parent().payload, userId: otherId },
      }).eligible,
    ).toBe(false);
    expect(
      postCallFinalizationRecoveryEligibility({
        ...parent(),
        payload: { ...parent().payload, userId: undefined },
      }).eligible,
    ).toBe(false);
  });
  it.each([
    null,
    {},
    { ...finalization, provider: "twilio_fallback" },
    { ...finalization, callId: "rtc/x" },
    { ...finalization, terminalStateReady: "true" },
    { ...finalization, providerHangupRequired: 1 },
    { ...finalization, leadId: "9223372036854775808" },
  ])("rejects malformed SIP authority %j", (value) => {
    expect(parsePostCallSipFinalization(value)).toBeNull();
  });
  it("pins one child identity per original tenant/job and validates the narrow payload", () => {
    const id = postCallFinalizationRecoveryId(userId, parentId);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(postCallFinalizationRecoveryId(userId.toUpperCase(), parentId)).toBe(id);
    expect(postCallFinalizationRecoveryId(otherId, parentId)).not.toBe(id);
    expect(postCallFinalizationRecoveryId(userId, otherId)).not.toBe(id);
    const child = {
      id,
      userId,
      type: POST_CALL_FINALIZATION_RECOVERY_TYPE,
      payload: { criticalRecoveryOf: parentId },
    };
    expect(recoveryParentId(child)).toBe(parentId);
    expect(() => recoveryParentId({ ...child, userId: otherId })).toThrow();
    expect(() =>
      recoveryParentId({ ...child, payload: { ...child.payload, finalization } }),
    ).toThrow();
    expect(() => postCallFinalizationRecoveryId("not-a-tenant", parentId)).toThrow();
  });
});

describe("transactional recovery staging", () => {
  beforeEach(() => vi.clearAllMocks());
  it("takes deletion/parent locks, verifies the call, and stores only the bounded parent reference", async () => {
    const { tx, events, conditions, inserted } = transaction([[parent()], [{ id: 42n }]]);
    const result = await enqueuePostCallFinalizationRecovery(tx, { parentJobId: parentId, userId });
    expect(events).toEqual(["deletion_fence", "parent_lock"]);
    expect(result).toMatchObject({
      eligible: true,
      created: true,
      jobId: postCallFinalizationRecoveryId(userId, parentId),
    });
    expect(inserted).toEqual([
      expect.objectContaining({
        id: result.jobId,
        userId,
        type: POST_CALL_FINALIZATION_RECOVERY_TYPE,
        payload: { criticalRecoveryOf: parentId },
        attempts: 0,
        maxAttempts: POST_CALL_FINALIZATION_RECOVERY_MAX_ATTEMPTS,
        status: "pending",
      }),
    ]);
    const dialect = new PgDialect();
    const queries = conditions.map((condition) =>
      dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]),
    );
    expect(queries[0].params).toEqual(
      expect.arrayContaining([parentId, userId, "post_call_digest", "dead"]),
    );
    expect(queries[1].params).toEqual(expect.arrayContaining([userId, "openai:rtc_example"]));
    expect(queries[1].sql).toContain("NOT EXISTS");
  });
  it("deduplicates against the same existing child instead of reopening its retry budget", async () => {
    const { tx, inserted } = transaction([[parent()], [{ id: 42n }]], true);
    expect(
      await enqueuePostCallFinalizationRecovery(tx, { parentJobId: parentId, userId }),
    ).toMatchObject({ eligible: true, created: false });
    expect(inserted[0].maxAttempts).toBe(5);
  });
  it("does not stage after parent disappearance or previously completed critical work", async () => {
    for (const rows of [[], [{ ...parent(), result: { finalization: { state: "completed" } } }]]) {
      const { tx, raw } = transaction([rows]);
      expect(
        (await enqueuePostCallFinalizationRecovery(tx, { parentJobId: parentId, userId })).eligible,
      ).toBe(false);
      expect(raw.insert).not.toHaveBeenCalled();
    }
  });
  it("does not stage without a matching live tenant call/deletion eligibility", async () => {
    const { tx, raw } = transaction([[parent()], []]);
    expect(
      await enqueuePostCallFinalizationRecovery(tx, { parentJobId: parentId, userId }),
    ).toMatchObject({ eligible: false, reason: "call_or_account_unavailable" });
    expect(raw.insert).not.toHaveBeenCalled();
  });
  it("propagates insert failure so the caller's parent-dead transaction rolls back", async () => {
    const { tx, raw } = transaction([[parent()], [{ id: 42n }]]);
    raw.insert.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    await expect(
      enqueuePostCallFinalizationRecovery(tx, { parentJobId: parentId, userId }),
    ).rejects.toThrow("storage unavailable");
  });
});
