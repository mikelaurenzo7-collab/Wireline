import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as unknown[][],
  call: 0,
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("../src/lib/server-context", () => {
  const builder = () => {
    const index = h.call++;
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(h.rows[index] ?? []).then(resolve);
    return chain;
  };
  const db = {
    select: () => builder(),
    execute: async () => [],
    insert: () => ({
      values: async (value: Record<string, unknown>) => {
        h.inserts.push(value);
      },
    }),
  };
  return {
    drizzle: { ...db, transaction: async (fn: (tx: typeof db) => unknown) => fn(db) },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

import {
  maybeSendMissedCallTextBack,
  MISSED_CALL_TEXT_BACK_ATTEMPT_ACTION,
  missedCallerRef,
  missedCallTextBackBody,
  missedCallTextBackEnabled,
} from "../src/lib/missed-call-text-back";

class AlreadyClaimed extends Error {}

const enabled = [{ preferences: { missed_call_text_back: { enabled: true } } }];
const brand = [{ brandName: "Ridge Inspections", businessName: null }];
const input = {
  userId: "tenant-1",
  agentId: "bot-1",
  twilioCallSid: "CA123",
  callerNumber: "+12175550100",
  reason: "concurrency" as const,
};

type SendCall = { beforeProviderAttempt: () => Promise<void> };

function deps(
  overrides: {
    covers?: boolean;
    status?: string;
    sendOk?: boolean;
    country?: string | null;
    ambiguous?: boolean;
  } = {},
) {
  return {
    resolveSender: vi.fn(async () => "+13125550100"),
    resolveRegistration: vi.fn(async () => ({
      status: overrides.status ?? "registered",
      coversMissedCalls: overrides.covers ?? true,
    })),
    lookupCountry: vi.fn(async () => (overrides.country === undefined ? "US" : overrides.country)),
    // Like sendTenantMessage: claim the durable attempt, then call the carrier.
    send: vi.fn(async (_userId: string, params: SendCall) => {
      await params.beforeProviderAttempt();
      return {
        ok: overrides.sendOk ?? true,
        code: "SMS_SENDER_NOT_OWNED",
        providerOutcomeAmbiguous: overrides.ambiguous,
      };
    }),
    alreadyClaimedError: AlreadyClaimed,
  };
}

describe("missed-call text-back", () => {
  beforeEach(() => {
    h.rows = [];
    h.call = 0;
    h.inserts = [];
  });

  it("is off unless the owner turned it on", async () => {
    expect(missedCallTextBackEnabled({})).toBe(false);
    expect(missedCallTextBackEnabled({ missed_call_text_back: { enabled: true } })).toBe(true);
    h.rows = [[{ preferences: {} }], brand];
    const d = deps();
    await expect(maybeSendMissedCallTextBack(input, d)).resolves.toBe("disabled");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("never texts after a billing stop or to a non-US or hidden caller", async () => {
    const d = deps();
    await expect(maybeSendMissedCallTextBack({ ...input, reason: "coverage" }, d)).resolves.toBe(
      "ineligible_reason",
    );
    await expect(
      maybeSendMissedCallTextBack({ ...input, callerNumber: "+442071838750" }, d),
    ).resolves.toBe("invalid_caller");
    await expect(maybeSendMissedCallTextBack({ ...input, callerNumber: null }, d)).resolves.toBe(
      "invalid_caller",
    );
    expect(d.send).not.toHaveBeenCalled();
  });

  it("needs a registered line whose approved campaign covers missed calls", async () => {
    h.rows = [enabled, brand];
    const uncovered = deps({ covers: false });
    await expect(maybeSendMissedCallTextBack(input, uncovered)).resolves.toBe("not_covered");
    expect(uncovered.send).not.toHaveBeenCalled();

    h.call = 0;
    const pending = deps({ status: "unregistered" });
    await expect(maybeSendMissedCallTextBack(input, pending)).resolves.toBe("not_covered");
    expect(pending.send).not.toHaveBeenCalled();
  });

  it("holds back a second text to the same caller within a day, and during a call flood", async () => {
    h.rows = [enabled, brand, [{ count: 1 }], [{ count: 0 }], [{ count: 0 }]];
    await expect(maybeSendMissedCallTextBack(input, deps())).resolves.toBe("recently_texted");

    // A text-back whose outcome was unknown still counts, though no SMS row exists.
    h.call = 0;
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 1 }], [{ count: 0 }]];
    await expect(maybeSendMissedCallTextBack(input, deps())).resolves.toBe("recently_texted");

    h.call = 0;
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 0 }], [{ count: 11 }]];
    await expect(maybeSendMissedCallTextBack(input, deps())).resolves.toBe("flood");
  });

  it("sends one branded text with opt-out language from the Bot's line", async () => {
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 0 }], [{ count: 1 }]];
    const d = deps();
    await expect(maybeSendMissedCallTextBack(input, d)).resolves.toBe("sent");
    expect(d.resolveSender).toHaveBeenCalledWith("tenant-1", "bot-1");
    expect(d.lookupCountry).toHaveBeenCalledWith("+12175550100");
    expect(d.send).toHaveBeenCalledWith("tenant-1", {
      to: "+12175550100",
      body: "Ridge Inspections: Sorry we missed your call. Reply here or call back anytime and we'll help. Reply STOP to opt out.",
      agentId: "bot-1",
      fromNumber: "+13125550100",
      idempotencyKey: "missed-call-text-back/CA123",
      beforeProviderAttempt: expect.any(Function),
    });
    // The durable attempt row is written before the carrier call, with no phone number in it.
    expect(h.inserts).toEqual([
      expect.objectContaining({
        action: MISSED_CALL_TEXT_BACK_ATTEMPT_ACTION,
        resourceId: "CA123",
        metadata: { caller_ref: missedCallerRef("tenant-1", "+12175550100") },
      }),
    ]);
    expect(JSON.stringify(h.inserts)).not.toContain("2175550100");
  });

  it("replies from the line the caller dialed and checks that line's registration", async () => {
    h.rows = [
      enabled,
      brand,
      [{ phoneNumber: "+13125550199" }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
    ];
    const d = deps();
    await expect(
      maybeSendMissedCallTextBack({ ...input, calledNumber: "+13125550199" }, d),
    ).resolves.toBe("sent");
    expect(d.resolveSender).not.toHaveBeenCalled();
    expect(d.resolveRegistration).toHaveBeenCalledWith("+13125550199");
    expect(d.send).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ fromNumber: "+13125550199" }),
    );
  });

  it("texts only callers Lookup places in the US, never on an unknown answer", async () => {
    for (const country of ["CA", null]) {
      h.call = 0;
      h.rows = [enabled, brand, [{ count: 0 }], [{ count: 0 }], [{ count: 0 }]];
      const d = deps({ country });
      await expect(
        maybeSendMissedCallTextBack({ ...input, callerNumber: "+14165550123" }, d),
      ).resolves.toBe("not_us");
      expect(d.send).not.toHaveBeenCalled();
    }
  });

  it("never sends twice for one call, and treats an unknown carrier outcome as final", async () => {
    // A retry finds this call's attempt row: the carrier is not called again.
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 0 }], [{ count: 0 }], [{ id: 1n }]];
    await expect(maybeSendMissedCallTextBack(input, deps())).resolves.toBe("already_attempted");
    expect(h.inserts).toEqual([]);

    // Another call from the same caller raced in and claimed first.
    h.call = 0;
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 0 }], [{ count: 0 }], [], [{ id: 2n }]];
    await expect(maybeSendMissedCallTextBack(input, deps())).resolves.toBe("recently_texted");

    h.call = 0;
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 0 }], [{ count: 0 }]];
    await expect(
      maybeSendMissedCallTextBack(input, deps({ ambiguous: true, sendOk: false })),
    ).resolves.toBe("ambiguous");
    expect(h.inserts).toHaveLength(1);
  });

  it("reports a refusal from the send boundary without throwing", async () => {
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 0 }], [{ count: 0 }]];
    await expect(maybeSendMissedCallTextBack(input, deps({ sendOk: false }))).resolves.toBe(
      "refused",
    );
    expect(missedCallTextBackBody(null)).toBe(
      "Sorry we missed your call. Reply here or call back anytime and we'll help. Reply STOP to opt out.",
    );
  });
});
