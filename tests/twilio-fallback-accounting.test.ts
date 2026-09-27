import { AsyncLocalStorage } from "node:async_hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scoped = vi.hoisted(() => ({ current: null as AsyncLocalStorage<string> | null }));
vi.mock("../src/lib/server-context", () => ({
  tenantStore: {
    run: (owner: string, operation: () => unknown) => scoped.current!.run(owner, operation),
  },
}));
vi.mock("../src/lib/voice/twilio-fallback-store", () => ({ twilioFallbackStore: {} }));
vi.mock("../src/lib/voice/native-inbound-admission", () => ({
  resolveNativeInboundAdmission: vi.fn(),
}));
vi.mock("../src/lib/voice/openai-sip-config", () => ({
  resolveOpenAISipSessionMaxSeconds: vi.fn(),
}));
vi.mock("../src/lib/voice-usage", () => ({ trackVoiceMinutes: vi.fn() }));
vi.mock("../src/lib/account-operation-lease", () => ({
  acquireAccountOperationLease: vi.fn(),
  releaseAccountOperationLease: vi.fn(),
}));

import {
  completeTwilioVoiceFallback,
  fallbackReceiptId,
  prepareTwilioVoiceFallback,
  type FallbackAdmission,
  type FallbackCompletion,
  type FallbackReceipt,
} from "../src/lib/voice/twilio-fallback";

const PARENT = `CA${"1".repeat(32)}`;
const CHILD = `CA${"2".repeat(32)}`;
const owner = "original-owner";
const input = {
  userId: owner,
  parentCallSid: PARENT,
  calledNumber: "+12025550140",
  callerNumber: "+12025550141",
  fallbackNumber: "+14155550199",
};
const leaseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const leaseExpiry = new Date(Date.now() + 990_000).toISOString();
const receipt: FallbackReceipt = {
  ...input,
  agentId: "bot-1",
  maxSeconds: 60,
  leaseId,
  leaseExpiresAt: leaseExpiry,
  completion: null,
};
const callback = {
  parentCallSid: PARENT,
  childCallSid: CHILD,
  calledNumber: input.calledNumber,
  callerNumber: input.callerNumber,
  status: "completed",
  durationSeconds: "60",
};

function harness() {
  let durable: FallbackReceipt | null = null;
  const settled = new Map<string, { owner: string; duration: number }>();
  const store = {
    releasePresence: vi.fn(async () => {}),
    findLine: vi.fn(async () => ({ agentId: "bot-1" })),
    find: vi.fn(async () => durable),
    claim: vi.fn(async (value: FallbackAdmission) => {
      durable ??= { ...value, completion: null };
      return durable;
    }),
    complete: vi.fn(async (_receipt: FallbackReceipt, value: FallbackCompletion) => {
      if (!durable) throw new Error("missing admission");
      if (durable.completion && JSON.stringify(durable.completion) !== JSON.stringify(value))
        throw new Error("conflicting terminal receipt");
      durable.completion ??= value;
      return durable.completion;
    }),
  };
  const dependencies = {
    store,
    admit: vi.fn(async () => ({ mode: "full" as "full" | "take_message" | "suspended" })),
    maxSeconds: vi.fn(() => 60),
    acquireLease: vi.fn(async () => ({ id: leaseId, expiresAt: new Date(leaseExpiry) })),
    releaseLease: vi.fn(async () => {}),
    releaseFunding: vi.fn(async () => {}),
    track: vi.fn(async (value: { userId: string; durationSeconds: number; vapiCallId: string }) => {
      expect(scoped.current!.getStore()).toBe(value.userId);
      settled.set(value.vapiCallId, { owner: value.userId, duration: value.durationSeconds });
    }),
  };
  return {
    dependencies,
    store,
    settled,
    seed: (value = receipt) => {
      durable = structuredClone(value);
    },
  };
}

beforeEach(() => {
  scoped.current = new AsyncLocalStorage<string>();
});

describe("bounded human fallback admission", () => {
  it("requires a real signed-call identity and a different E.164 destination before admission", async () => {
    const h = harness();
    for (const patch of [
      { parentCallSid: "unknown" },
      { fallbackNumber: input.calledNumber },
      { fallbackNumber: "invalid" },
      { calledNumber: "invalid" },
    ]) {
      expect(await prepareTwilioVoiceFallback({ ...input, ...patch }, h.dependencies)).toBeNull();
    }
    expect(h.dependencies.admit).not.toHaveBeenCalled();
    expect(h.store.claim).not.toHaveBeenCalled();
  });

  it("does not trust a settings-only sender as an owned line", async () => {
    const h = harness();
    h.store.findLine.mockResolvedValueOnce(null as never);
    expect(await prepareTwilioVoiceFallback(input, h.dependencies)).toBeNull();
    expect(h.store.claim).not.toHaveBeenCalled();
  });

  it.each(["suspended", "take_message"] as const)(
    "refuses a new PSTN leg for %s admission",
    async (mode) => {
      const h = harness();
      h.dependencies.admit.mockResolvedValue({ mode });
      expect(await prepareTwilioVoiceFallback(input, h.dependencies)).toBeNull();
      expect(h.store.claim).not.toHaveBeenCalled();
    },
  );

  it("propagates unavailable coverage without creating a transfer", async () => {
    const h = harness();
    h.dependencies.admit.mockRejectedValue(new Error("coverage unavailable"));
    await expect(prepareTwilioVoiceFallback(input, h.dependencies)).rejects.toThrow(
      "coverage unavailable",
    );
    expect(h.store.claim).not.toHaveBeenCalled();
  });

  it("persists the admitted limit and owner before returning a dialable receipt", async () => {
    const h = harness();
    await expect(prepareTwilioVoiceFallback(input, h.dependencies)).resolves.toEqual(receipt);
    expect(h.dependencies.admit).toHaveBeenCalledWith(owner, "bot-1");
    expect(h.store.claim).toHaveBeenCalledWith(receiptWithoutCompletion());
  });

  it("retries retain the admitted target/limit and do not consume a second presence slot", async () => {
    const h = harness();
    h.seed();
    await expect(
      prepareTwilioVoiceFallback({ ...input, fallbackNumber: "+12025550150" }, h.dependencies),
    ).resolves.toEqual(receipt);
    expect(h.dependencies.admit).not.toHaveBeenCalled();
    expect(h.store.claim).not.toHaveBeenCalled();
  });

  it("does not redial after settlement or across a changed line owner", async () => {
    const h = harness();
    h.seed({
      ...receipt,
      completion: { childCallSid: CHILD, status: "completed", durationSeconds: 60 },
    });
    expect(await prepareTwilioVoiceFallback(input, h.dependencies)).toBeNull();
    h.seed();
    expect(
      await prepareTwilioVoiceFallback({ ...input, userId: "new-owner" }, h.dependencies),
    ).toBeNull();
  });

  it("refuses deletion-fenced admission and releases an unused provider lease", async () => {
    const h = harness();
    h.dependencies.acquireLease.mockResolvedValueOnce(null as never);
    expect(await prepareTwilioVoiceFallback(input, h.dependencies)).toBeNull();
    expect(h.store.claim).not.toHaveBeenCalled();
    h.store.claim.mockResolvedValueOnce(null as never);
    expect(await prepareTwilioVoiceFallback(input, h.dependencies)).toBeNull();
    expect(h.dependencies.releaseLease).toHaveBeenCalledWith({ id: leaseId, userId: owner });
  });

  it("does not return an expired pending admission", async () => {
    const h = harness();
    h.seed({ ...receipt, leaseExpiresAt: "2020-01-01T00:00:00Z" });
    expect(await prepareTwilioVoiceFallback(input, h.dependencies)).toBeNull();
  });

  it("does not restart the funded deadline while its deletion lease is still valid", async () => {
    const h = harness();
    h.seed({ ...receipt, deadlineAtMs: Date.now() - 1 });
    expect(await prepareTwilioVoiceFallback(input, h.dependencies)).toBeNull();
    expect(h.dependencies.acquireLease).not.toHaveBeenCalled();
    expect(h.dependencies.releaseFunding).not.toHaveBeenCalled();
    expect(h.dependencies.track).not.toHaveBeenCalled();
  });

  it("retains the deletion lease when the admission transaction commit is ambiguous", async () => {
    const h = harness();
    h.store.claim.mockImplementationOnce(async (admission) => {
      h.seed({ ...admission, completion: null });
      throw new Error("commit response lost");
    });
    await expect(prepareTwilioVoiceFallback(input, h.dependencies)).rejects.toThrow(
      "commit response lost",
    );
    expect(h.dependencies.releaseLease).not.toHaveBeenCalled();
    await expect(prepareTwilioVoiceFallback(input, h.dependencies)).resolves.toMatchObject({
      leaseId,
    });
    expect(h.dependencies.acquireLease).toHaveBeenCalledTimes(1);
  });
});

function receiptWithoutCompletion(): FallbackAdmission {
  const { completion: _completion, ...admission } = receipt;
  return admission;
}

describe("durable fallback settlement", () => {
  it("settles the admitted owner after number reassignment without checking current coverage", async () => {
    const h = harness();
    h.seed();
    h.store.findLine.mockRejectedValue(new Error("number now belongs to another owner"));
    h.dependencies.admit.mockRejectedValue(new Error("account reclassified"));
    await expect(completeTwilioVoiceFallback(callback, h.dependencies)).resolves.toBe(true);
    expect(h.dependencies.track).toHaveBeenCalledWith({
      userId: owner,
      durationSeconds: 60,
      vapiCallId: fallbackReceiptId(PARENT),
    });
    expect(h.store.findLine).not.toHaveBeenCalled();
    expect(h.dependencies.admit).not.toHaveBeenCalled();
  });

  it("converges action and child-status receipts on one usage key", async () => {
    const h = harness();
    h.seed();
    await completeTwilioVoiceFallback(callback, h.dependencies);
    await completeTwilioVoiceFallback(
      {
        ...callback,
        source: "status",
        calledNumber: receipt.fallbackNumber,
        callerNumber: receipt.calledNumber,
      },
      h.dependencies,
    );
    expect(h.settled.size).toBe(1);
    expect(h.dependencies.track.mock.calls.map(([value]) => value.vapiCallId)).toEqual([
      fallbackReceiptId(PARENT),
      fallbackReceiptId(PARENT),
    ]);
  });

  it("retries a failed debit against the already-pinned receipt", async () => {
    const h = harness();
    h.seed();
    h.dependencies.track.mockRejectedValueOnce(new Error("ledger unavailable"));
    await expect(completeTwilioVoiceFallback(callback, h.dependencies)).rejects.toThrow(
      "ledger unavailable",
    );
    expect(h.dependencies.releaseLease).not.toHaveBeenCalled();
    expect(h.store.releasePresence).not.toHaveBeenCalled();
    await expect(completeTwilioVoiceFallback(callback, h.dependencies)).resolves.toBe(true);
    expect(h.settled.size).toBe(1);
    expect(h.dependencies.releaseLease).toHaveBeenCalledWith({ id: leaseId, userId: owner });
  });

  it.each([
    undefined,
    null,
    "",
    "NaN",
    "-1",
    "1.5",
    "1e2",
    1.5,
    -1,
    Infinity,
    2_147_483_648,
    Number.MAX_SAFE_INTEGER + 1,
  ])("does not bill invalid completed duration %s", async (durationSeconds) => {
    const h = harness();
    h.seed();
    await expect(
      completeTwilioVoiceFallback({ ...callback, durationSeconds }, h.dependencies),
    ).rejects.toThrow("duration");
    expect(h.dependencies.track).not.toHaveBeenCalled();
  });

  it("preserves actual signed overrun duration while capping the customer at admission", async () => {
    const h = harness();
    h.seed();
    expect(
      await completeTwilioVoiceFallback({ ...callback, durationSeconds: "70" }, h.dependencies),
    ).toBe(true);
    expect(h.store.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ durationSeconds: 70 }),
    );
    expect(h.dependencies.track).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 60 }),
    );
  });

  it.each([
    { childCallSid: "" },
    { childCallSid: PARENT },
    { calledNumber: "+12025550190" },
    { callerNumber: "+12025550190" },
    { status: "ringing" },
  ])("rejects a completion outside its parent/child binding: %j", async (patch) => {
    const h = harness();
    h.seed();
    await expect(
      completeTwilioVoiceFallback({ ...callback, ...patch }, h.dependencies),
    ).rejects.toThrow();
    expect(h.dependencies.track).not.toHaveBeenCalled();
  });

  it("cannot fabricate a charge for a signed legacy call without an admission receipt", async () => {
    const h = harness();
    expect(await completeTwilioVoiceFallback(callback, h.dependencies)).toBe(false);
    expect(h.dependencies.track).not.toHaveBeenCalled();
  });

  it("returns funding for a carrier-confirmed unanswered attempt without customer usage", async () => {
    const h = harness();
    h.seed();
    expect(
      await completeTwilioVoiceFallback(
        { ...callback, status: "busy", durationSeconds: undefined },
        h.dependencies,
      ),
    ).toBe(true);
    expect(h.dependencies.track).not.toHaveBeenCalled();
    expect(h.dependencies.releaseFunding).toHaveBeenCalledWith(
      owner,
      `twilio-fallback:${PARENT}`,
      "confirmed_unanswered",
    );
  });
});
