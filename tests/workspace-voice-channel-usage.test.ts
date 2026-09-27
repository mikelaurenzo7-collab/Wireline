import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ voice: vi.fn(), balance: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  quotaTracker: {
    getProfile: async () => ({ profile: { claude_tokens_daily: 1000 } }),
    getUsage: async () => 0,
  },
}));
vi.mock("../src/lib/voice-usage", () => ({ getVoiceUsageSnapshot: h.voice }));
vi.mock("../src/lib/credit-wallet", () => ({ getCreditBalanceUsd: h.balance }));
vi.mock("../src/lib/spend-guards", () => ({
  getBudgetSnapshot: async () => ({ mtdCost: 0, budget: null }),
  clearBudgetCache: vi.fn(),
}));
vi.mock("../src/lib/plan-entitlements", () => ({ defaultAiSpendBudgetUsdForPlan: () => 1.5 }));
import { getWorkspaceUsageSnapshot } from "../src/lib/workspace-usage-snapshot";

beforeEach(() => {
  h.voice.mockResolvedValue({
    plan_id: "voice",
    subscription_status: "active",
    voice_minutes_used: 0,
    voice_minutes_included: 30,
    voice_minutes_remaining: 30,
    overage_per_min_usd: 0.22,
  });
  h.balance.mockResolvedValue(20);
});

describe("customer-visible call policy", () => {
  it("never describes prepaid Email-only accounts as eligible to call", async () => {
    h.voice.mockResolvedValue({
      plan_id: "email",
      subscription_status: "active",
      voice_minutes_used: 0,
      voice_minutes_included: 0,
      voice_minutes_remaining: 0,
      overage_per_min_usd: 0,
    });
    expect(await getWorkspaceUsageSnapshot("user")).toMatchObject({
      live_voice_blocked: true,
      completion_grace_minutes: 0,
    });
  });
  it("reports the bounded channel grace without changing legacy policy", async () => {
    expect(await getWorkspaceUsageSnapshot("user")).toMatchObject({
      live_voice_blocked: false,
      current_call_policy: "bounded_completion_grace",
      completion_grace_minutes: 10,
    });
    h.voice.mockResolvedValue({
      plan_id: "starter",
      subscription_status: "active",
      voice_minutes_used: 0,
      voice_minutes_included: 50,
      voice_minutes_remaining: 50,
      overage_per_min_usd: 0.22,
    });
    expect(await getWorkspaceUsageSnapshot("user")).toMatchObject({
      current_call_policy: "finish_current_block_next",
      completion_grace_minutes: null,
    });
  });
  it("blocks a new call during debt even with unused included minutes", async () => {
    h.balance.mockResolvedValue(-0.22);
    expect(await getWorkspaceUsageSnapshot("user")).toMatchObject({
      live_voice_blocked: true,
      completion_grace_due_usd: 0.22,
    });
  });
  it.each(["canceled", "past_due", null])(
    "does not present %s subscriptions as voice-ready",
    async (subscription_status) => {
      h.voice.mockResolvedValue({
        plan_id: "voice",
        subscription_status,
        voice_minutes_used: 0,
        voice_minutes_included: 30,
        voice_minutes_remaining: 30,
        overage_per_min_usd: 0.22,
      });
      expect(await getWorkspaceUsageSnapshot("user")).toMatchObject({ live_voice_blocked: true });
    },
  );
});
