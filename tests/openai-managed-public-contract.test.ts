import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeOpenApiForManagedRuntime } from "../src/lib/openapi-managed-runtime";
import { getOpenApiSpec } from "../src/lib/openapi-spec";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("OpenAI managed public contracts", () => {
  it("publishes the real health response and OpenAI-backed insight contract", () => {
    const spec = normalizeOpenApiForManagedRuntime(
      getOpenApiSpec("https://trywireline.com"),
    ) as any;
    const health = spec.components.schemas.HealthResponse;
    const serialized = JSON.stringify(spec);

    expect(health.required).toEqual(["ok", "timestamp"]);
    expect(health.properties.ok.type).toBe("boolean");
    expect(health.properties).not.toHaveProperty("claude_model");
    expect(spec.components.schemas.DailyBrief.description).toContain("AI-authored");
    expect(spec.paths["/api/insights/daily-brief"].get.summary).toContain("AI-authored");
    expect(serialized).not.toContain("OpenAI-authored");
    expect(serialized).not.toContain("Claude-authored");
    expect(serialized).not.toContain("Claude / Stripe unconfigured");
  });

  it("exposes provider-neutral token quota fields while retaining storage compatibility", () => {
    const spec = normalizeOpenApiForManagedRuntime(getOpenApiSpec()) as any;
    const quota = spec.components.schemas.QuotaUsage;
    const quotaRoute = read("src/routes/quota-routes.ts");
    const workspaceUsage = read("src/lib/workspace-usage-snapshot.ts");
    const billingTypes = read("src/types/api-billing.ts");

    expect(quota.properties.limits.properties).toHaveProperty("ai_tokens_daily");
    expect(quota.properties.usage.properties).toHaveProperty("ai_tokens_daily");
    expect(quotaRoute).toContain('PUBLIC_AI_TOKEN_DIMENSION = "ai_tokens_daily"');
    expect(quotaRoute).toContain('INTERNAL_AI_TOKEN_DIMENSION = "claude_tokens_daily"');
    expect(quotaRoute).toContain("value: numericValue");
    expect(quotaRoute).not.toContain(
      "res.json({ success: true, dimension: publicDimension, value, enabled })",
    );
    expect(workspaceUsage).toContain("ai_tokens_used_today");
    expect(workspaceUsage).not.toContain("claude_tokens_used_today");
    expect(billingTypes).toContain("ai_tokens_daily_limit");
    expect(billingTypes).not.toContain("claude_tokens_daily_limit");
  });
});
