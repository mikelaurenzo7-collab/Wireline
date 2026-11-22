import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rows: [] as unknown[][], call: 0 }));

vi.mock("../src/lib/server-context", () => {
  const builder = () => {
    const index = h.call++;
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(h.rows[index] ?? []).then(resolve);
    return chain;
  };
  return {
    drizzle: { select: () => builder() },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

import {
  maybeSendMissedCallTextBack,
  missedCallTextBackBody,
  missedCallTextBackEnabled,
} from "../src/lib/missed-call-text-back";

const enabled = [{ preferences: { missed_call_text_back: { enabled: true } } }];
const brand = [{ brandName: "Ridge Inspections", businessName: null }];
const input = {
  userId: "tenant-1",
  agentId: "bot-1",
  twilioCallSid: "CA123",
  callerNumber: "+12175550100",
  reason: "concurrency" as const,
};

function deps(overrides: { covers?: boolean; status?: string; sendOk?: boolean } = {}) {
  return {
    resolveSender: vi.fn(async () => "+13125550100"),
    resolveRegistration: vi.fn(async () => ({
      status: overrides.status ?? "registered",
      coversMissedCalls: overrides.covers ?? true,
    })),
    send: vi.fn(async () => ({ ok: overrides.sendOk ?? true, code: "SMS_SENDER_NOT_OWNED" })),
  };
}

describe("missed-call text-back", () => {
  beforeEach(() => {
    h.rows = [];
    h.call = 0;
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
    h.rows = [enabled, brand, [{ count: 1 }], [{ count: 0 }]];
    await expect(maybeSendMissedCallTextBack(input, deps())).resolves.toBe("recently_texted");

    h.call = 0;
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 11 }]];
    await expect(maybeSendMissedCallTextBack(input, deps())).resolves.toBe("flood");
  });

  it("sends one branded text with opt-out language from the Bot's line", async () => {
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 1 }]];
    const d = deps();
    await expect(maybeSendMissedCallTextBack(input, d)).resolves.toBe("sent");
    expect(d.resolveSender).toHaveBeenCalledWith("tenant-1", "bot-1");
    expect(d.send).toHaveBeenCalledWith("tenant-1", {
      to: "+12175550100",
      body: "Ridge Inspections: Sorry we missed your call. Reply here or call back anytime and we'll help. Reply STOP to opt out.",
      agentId: "bot-1",
      idempotencyKey: "missed-call-text-back/CA123",
    });
  });

  it("reports a refusal from the send boundary without throwing", async () => {
    h.rows = [enabled, brand, [{ count: 0 }], [{ count: 0 }]];
    await expect(maybeSendMissedCallTextBack(input, deps({ sendOk: false }))).resolves.toBe(
      "refused",
    );
    expect(missedCallTextBackBody(null)).toBe(
      "Sorry we missed your call. Reply here or call back anytime and we'll help. Reply STOP to opt out.",
    );
  });
});
