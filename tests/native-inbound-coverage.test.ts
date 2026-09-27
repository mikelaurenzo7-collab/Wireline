import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  select: vi.fn(),
  wallet: vi.fn(),
  concurrency: vi.fn(),
  quota: vi.fn(),
  hours: vi.fn(),
  filters: [] as unknown[],
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: h.select },
  quotaTracker: { checkAndIncrement: h.quota },
  log: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../src/lib/voice-wallet-guard", () => ({ getVoiceWalletSnapshot: h.wallet }));
vi.mock("../src/lib/inbound-concurrency", () => ({ inboundConcurrencyExceeded: h.concurrency }));
vi.mock("../src/lib/agent-runtime", () => ({ isWithinBusinessHours: h.hours }));
import {
  resolveNativeInboundAdmission,
  resolveNativeInboundCallAdmission,
} from "../src/lib/voice/native-inbound-admission";

function query(rows: unknown[] | Error) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: (filter: unknown) => {
      h.filters.push(filter);
      return chain;
    },
    limit: async () => {
      if (rows instanceof Error) throw rows;
      return rows;
    },
  };
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.filters = [];
  h.select.mockImplementation(() => query([{ subscriptionStatus: "active" }]));
  h.wallet.mockResolvedValue({
    live_voice_enabled: true,
    sufficient: true,
    completion_grace_due_usd: 0,
  });
  h.concurrency.mockResolvedValue(false);
  h.quota.mockResolvedValue({ allowed: true, persisted: true });
  h.hours.mockReturnValue(true);
});

describe("same-call funded admission recovery", () => {
  const input = {
    userId: "tenant",
    agentId: "bot",
    callId: "call",
    twilioCallSid: "CA-source",
    callerNumber: "+13125550101",
  };
  const receipt = {
    action: "voice.realtime.session",
    provider: "openai",
    costUsd: "1",
    phase: "claimed",
    metadata: {
      surface: "openai_sip",
      accounting_state: "provider_outcome_ambiguous",
      inbound_admission: { mode: "full" },
    },
  };
  it.each(["reserved_before_provider", "provider_outcome_ambiguous", "committed"])(
    "recovers %s funding without reinterpreting a depleted current balance",
    async (state) => {
      h.select.mockReturnValueOnce(
        query([{ ...receipt, metadata: { ...receipt.metadata, accounting_state: state } }]),
      );
      h.wallet.mockResolvedValue({
        live_voice_enabled: false,
        sufficient: false,
        completion_grace_due_usd: 5,
      });
      await expect(resolveNativeInboundCallAdmission(input)).resolves.toEqual({ mode: "full" });
      expect(h.wallet).not.toHaveBeenCalled();
      const compiled = new PgDialect().sqlToQuery(h.filters[0] as never);
      for (const value of [
        "tenant",
        "bot",
        "openai:call",
        "twilio:CA-source",
        "inbound",
        "+13125550101",
      ])
        expect(compiled.params).toContain(value);
    },
  );
  it("retains original after-hours restrictions on a funded retry", async () => {
    h.select.mockReturnValueOnce(
      query([
        {
          ...receipt,
          metadata: {
            ...receipt.metadata,
            inbound_admission: { mode: "take_message", reason: "after_hours", greeting: "Closed." },
          },
        },
      ]),
    );
    await expect(resolveNativeInboundCallAdmission(input)).resolves.toEqual({
      mode: "take_message",
      reason: "after_hours",
      greeting: "Closed.",
    });
    expect(h.wallet).not.toHaveBeenCalled();
  });
  it("does not upgrade a legacy receipt to full Bot privileges", async () => {
    h.select.mockReturnValueOnce(
      query([{ ...receipt, metadata: { surface: "openai_sip", accounting_state: "committed" } }]),
    );
    await expect(resolveNativeInboundCallAdmission(input)).resolves.toEqual({
      mode: "recovery_notice",
      reason: "recovery",
    });
  });
  it.each([
    undefined,
    { ...receipt, provider: "other" },
    { ...receipt, costUsd: "0" },
    { ...receipt, phase: "unknown" },
  ])("runs fresh coverage gates when no valid matching funding exists", async (prior) => {
    h.select.mockReturnValueOnce(query(prior ? [prior] : []));
    h.wallet.mockResolvedValue({
      live_voice_enabled: true,
      sufficient: false,
      completion_grace_due_usd: 0,
    });
    await expect(resolveNativeInboundCallAdmission(input)).resolves.toEqual({
      mode: "suspended",
      reason: "coverage",
    });
    expect(h.wallet).toHaveBeenCalledOnce();
  });
  it("leaves failed recovery lookup retryable instead of granting provider work", async () => {
    h.select.mockReturnValueOnce(query(new Error("DB unavailable")));
    await expect(resolveNativeInboundCallAdmission(input)).rejects.toMatchObject({ status: 503 });
    expect(h.wallet).not.toHaveBeenCalled();
  });
});

describe("independent inbound voice coverage", () => {
  it("admits covered paid voice without reading an AI-spend allowance", async () => {
    await expect(resolveNativeInboundAdmission("tenant")).resolves.toEqual({ mode: "full" });
    expect(h.wallet).toHaveBeenCalledWith("tenant");
    expect(h.quota).toHaveBeenCalledWith("tenant", "voice_minutes_daily", 0);
    expect(h.concurrency).toHaveBeenCalledWith("tenant");
  });

  it("does not grant live voice from stale active settings when paid entitlement is absent", async () => {
    h.wallet.mockResolvedValue({
      live_voice_enabled: false,
      sufficient: false,
      completion_grace_due_usd: 0,
    });
    await expect(resolveNativeInboundAdmission("tenant")).resolves.toEqual({
      mode: "suspended",
      reason: "subscription",
    });
  });

  it.each([0, 1, 5])("refuses new paid AI when voice is depleted with $%i due", async (due) => {
    h.wallet.mockResolvedValue({
      live_voice_enabled: true,
      sufficient: false,
      completion_grace_due_usd: due,
    });
    await expect(resolveNativeInboundAdmission("tenant")).resolves.toMatchObject({
      mode: "suspended",
      reason: due > 0 ? "completion_grace" : "coverage",
    });
    expect(h.quota).not.toHaveBeenCalled();
  });

  it.each(["subscription", "wallet", "daily", "concurrency"])(
    "fails closed on unavailable %s accounting",
    async (stage) => {
      if (stage === "subscription") h.select.mockReturnValue(query(new Error("DB unavailable")));
      if (stage === "wallet") h.wallet.mockRejectedValue(new Error("DB unavailable"));
      if (stage === "daily") h.quota.mockRejectedValue(new Error("DB unavailable"));
      if (stage === "concurrency") h.concurrency.mockRejectedValue(new Error("DB unavailable"));
      await expect(resolveNativeInboundAdmission("tenant")).rejects.toThrow();
    },
  );

  it("does not accept a non-durable daily quota fallback", async () => {
    h.quota.mockResolvedValue({ allowed: true, persisted: false });
    await expect(resolveNativeInboundAdmission("tenant")).rejects.toMatchObject({ status: 503 });
  });

  it.each(["concurrency", "daily"])("refuses new paid AI at known %s exhaustion", async (stage) => {
    if (stage === "concurrency") h.concurrency.mockResolvedValue(true);
    else h.quota.mockResolvedValue({ allowed: false, persisted: true });
    await expect(resolveNativeInboundAdmission("tenant")).resolves.toMatchObject({
      mode: "suspended",
      reason: stage === "daily" ? "daily_minutes" : "concurrency",
    });
  });

  it("keeps bounded after-hours message-taking only with verified funded voice", async () => {
    h.select
      .mockReturnValueOnce(query([{ subscriptionStatus: "active" }]))
      .mockReturnValueOnce(
        query([
          { businessHours: {}, timezone: "America/Chicago", outOfHoursMessage: "We are closed." },
        ]),
      );
    h.hours.mockReturnValue(false);
    await expect(resolveNativeInboundAdmission("tenant", "bot")).resolves.toEqual({
      mode: "take_message",
      reason: "after_hours",
      greeting: "We are closed.",
    });
    expect(h.wallet).toHaveBeenCalledOnce();
    expect(h.concurrency).toHaveBeenCalledOnce();
    expect(h.quota).toHaveBeenCalledOnce();
  });

  it("does not let after-hours status grant AI voicemail without coverage", async () => {
    h.select
      .mockReturnValueOnce(query([{ subscriptionStatus: "active" }]))
      .mockReturnValueOnce(query([{ businessHours: {}, timezone: "America/Chicago" }]));
    h.hours.mockReturnValue(false);
    h.wallet.mockResolvedValue({
      live_voice_enabled: true,
      sufficient: false,
      completion_grace_due_usd: 0,
    });
    await expect(resolveNativeInboundAdmission("tenant", "bot")).resolves.toMatchObject({
      mode: "suspended",
      reason: "coverage",
    });
  });

  it("does not let after-hours message-taking skip an unavailable wallet", async () => {
    h.select
      .mockReturnValueOnce(query([{ subscriptionStatus: "active" }]))
      .mockReturnValueOnce(
        query([
          { businessHours: {}, timezone: "America/Chicago", outOfHoursMessage: "We are closed." },
        ]),
      );
    h.hours.mockReturnValue(false);
    h.wallet.mockRejectedValue(new Error("DB unavailable"));
    await expect(resolveNativeInboundAdmission("tenant", "bot")).rejects.toMatchObject({
      status: 503,
    });
  });
});
