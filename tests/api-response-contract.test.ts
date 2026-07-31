import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FollowUpTaskCreateSchema, parseFormData } from "../src/lib/form-validators";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("API response contract", () => {
  it("exports billing status types consumed by global banners", () => {
    const billingTypes = read("src/types/api-billing.ts");
    expect(billingTypes).toContain("export interface BillingStatusResponse");
    expect(billingTypes).toContain("email_verified: boolean");
    expect(billingTypes).toContain("trial: BillingTrialBlock | null");

    const trialBanner = read("src/components/layout/TrialBanner.tsx");
    expect(trialBanner).toContain("BillingStatusResponse");
    expect(trialBanner).not.toContain("eslint-disable @typescript-eslint/no-explicit-any");

    const emailBanner = read("src/components/layout/EmailVerifyBanner.tsx");
    expect(emailBanner).toContain("BillingStatusResponse");
  });

  it("wires Grok strengths into live voice runtime paths", () => {
    const grokVoice = read("src/lib/voice/grok-voice-service.ts");
    expect(grokVoice).toContain("buildGrokStrengthsPromptSection");

    const vapiFactory = read("src/lib/vapi-assistant-factory-v2.ts");
    expect(vapiFactory).toContain("isGrokModelId");
    expect(vapiFactory).toContain("buildGrokStrengthsPromptSection");
  });

  it("keeps usage meter on the shared workspace usage response type", () => {
    const usageMeter = read("src/components/UsageMeter.tsx");
    expect(usageMeter).toContain("WorkspaceUsageResponse");
    expect(usageMeter).not.toMatch(/interface UsageSnapshot/);
  });

  it("types insights funnel and leaderboard views against shared contracts", () => {
    const funnel = read("src/components/insights/FunnelView.tsx");
    expect(funnel).toContain("InsightsFunnelResponse");
    expect(funnel).not.toMatch(/useState<any>/);

    const leaderboard = read("src/components/insights/LeaderboardView.tsx");
    expect(leaderboard).toContain("InsightsLeaderboardResponse");
    const insightsTypes = read("src/types/api-insights.ts");
    expect(insightsTypes).toContain("InsightsFunnelResponse");
    expect(insightsTypes).toContain("InsightsAttributionResponse");
    expect(insightsTypes).toContain("InsightsHeatmapResponse");
    expect(insightsTypes).toContain("InsightsQaStatsResponse");
    expect(insightsTypes).toContain("VoiceLatencyInsightsResponse");
  });

  it("syncs billing status OpenAPI schema with live route fields", () => {
    const openapi = read("src/lib/openapi-spec.ts");
    expect(openapi).toContain("email_verified");
    expect(openapi).toContain("signup_intent");
    expect(openapi).toContain("trial:");
  });

  it("rejects an unparseable task due_date instead of failing inside the driver", () => {
    // The create handler does `new Date(due_date)` and hands the result to the
    // insert. A string that is not a date yields an Invalid Date, which threw in
    // the driver and surfaced as a 500 for what is a malformed request. The
    // update path already guarded this; create was never given the same check.
    const base = { description: "probe", agent_id: "agent-1" };

    for (const bad of ["not-a-date", "2026-13-45", "tomorrow"]) {
      const result = parseFormData(FollowUpTaskCreateSchema, { ...base, due_date: bad });
      expect(result.success, `expected ${bad} to be rejected`).toBe(false);
      expect(result.errors?.due_date).toBe("due_date must be a valid date");
    }

    // Absent, null, and empty all mean "no due date" and must stay valid, since
    // clearing a due date is a supported request rather than a malformed one.
    for (const cleared of [undefined, null, ""]) {
      const payload = cleared === undefined ? base : { ...base, due_date: cleared };
      expect(parseFormData(FollowUpTaskCreateSchema, payload).success).toBe(true);
    }

    for (const good of ["2026-12-01", "2026-12-01T10:00:00Z"]) {
      expect(parseFormData(FollowUpTaskCreateSchema, { ...base, due_date: good }).success).toBe(
        true,
      );
    }
  });
});
