import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(read("src/types/api-insights.ts")).toContain("InsightsFunnelResponse");
  });
});
