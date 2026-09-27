import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveProfile } from "../src/lib/tenant-quotas";
import { voiceMinutesDailyQuotaForTier } from "../src/lib/plan-entitlements";

vi.mock("../src/lib/server-context", () => ({ log: { warn: vi.fn() } }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-7 voice usage integrity", () => {
  it("settles the daily voice burst cap atomically with each provider call", () => {
    // Dial-time authorization reserves zero units. Completed-call settlement
    // therefore owns the daily counter, and it must share the same transaction
    // as the provider-call idempotency claim so retries cannot double count.
    const usage = read("src/lib/voice-usage.ts");
    const prepare = usage.slice(
      usage.indexOf("async function prepareVoiceUsage"),
      usage.indexOf("export async function trackVoiceMinutes"),
    );
    expect(prepare).toContain("return drizzle.transaction(async (tx) =>");
    expect(prepare).toContain(".insert(voiceUsageEvents)");
    expect(prepare).toContain('dimension: "voice_minutes_daily"');
    expect(prepare).toContain("periodKey: dailyKey");
    expect(prepare).toContain("if (!inserted) {");
    expect(prepare.indexOf("if (!inserted) {")).toBeLessThan(
      prepare.indexOf('dimension: "voice_minutes_daily"'),
    );
    expect(usage).not.toContain('checkAndIncrement(userId, "voice_minutes_daily"');

    const control = read("src/lib/voice-spend-control.ts");
    expect(control).toContain('"voice_minutes_daily"');

    // Guard the regression: settlement still derives from billable minutes.
    expect(usage).toContain("const minutes = billableVoiceMinutes(durationSeconds)");
  });

  it("keeps the daily voice quota dimension wired to the tier table", () => {
    expect(resolveProfile("personal", []).voice_minutes_daily).toBe(
      voiceMinutesDailyQuotaForTier("personal"),
    );
    expect(resolveProfile("personal", [], "voice-high").voice_minutes_daily).toBe(500);
    expect(resolveProfile("personal", [], "email-high").voice_minutes_daily).toBe(0);
  });
});
