import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const AUTHENTICATED_PAGE_INTROS = [
  "src/pages/ClientAppsPage.tsx",
  "src/pages/EmailPage.tsx",
  "src/pages/TemplatesPage.tsx",
  "src/pages/KnowledgePage.tsx",
  "src/pages/ApprovalsPage.tsx",
] as const;

describe("authenticated minimal copy contract", () => {
  it("keeps Wire page chrome on a single WorkspacePageIntro plus the integration map", () => {
    const connectionsPage = read("src/pages/ConnectionsPage.tsx");
    const map = read("src/components/integrations/IntegrationOperatingMap.tsx");
    expect(connectionsPage).toMatch(/IntegrationOperatingMap/);
    expect(connectionsPage).toMatch(/WorkspacePageIntro[\s\S]*title="Wire"/);
    expect(connectionsPage).not.toMatch(/WorkspacePageIntro[\s\S]*description=/);
    expect(map).toMatch(/Integration map/);
  });

  it("keeps workspace page intros title-first without coaching copy", () => {
    const intro = read("src/components/layout/WorkspacePageFrame.tsx");
    expect(intro).toContain("Minimal page title");
    expect(intro).not.toContain("eyebrow?:");

    for (const path of [...AUTHENTICATED_PAGE_INTROS, "src/pages/ConnectionsPage.tsx"]) {
      const source = read(path);
      expect(source).toContain("WorkspacePageIntro");
      expect(source).not.toMatch(/WorkspacePageIntro[\s\S]*description=/);
      expect(source).not.toMatch(/WorkspacePageIntro[\s\S]*eyebrow=/);
    }
  });

  it("keeps insights empty states free of coaching paragraphs", () => {
    const ops = read("src/lib/wireline-ops-design.ts");
    expect(ops).not.toMatch(/OPS_INSIGHTS_EMPTY[\s\S]*description:/);

    const insightEmpty = read("src/components/insights/shared.tsx");
    expect(insightEmpty).not.toContain("descriptionOverride");
    expect(insightEmpty).not.toMatch(/eyebrow=\{config\.eyebrow\}/);
  });

  it("types remaining high-traffic insight views", () => {
    expect(read("src/components/insights/TopicsView.tsx")).toContain("InsightsTopicsResponse");
    expect(read("src/components/insights/FailureModesView.tsx")).toContain(
      "InsightsFailureModesResponse",
    );
    expect(read("src/components/insights/VoiceReliabilityView.tsx")).toContain(
      "VoiceReliabilityResponse",
    );
    expect(read("src/components/insights/AttributionView.tsx")).toContain(
      "InsightsAttributionResponse",
    );
    expect(read("src/components/insights/HeatmapView.tsx")).toContain("InsightsHeatmapResponse");
    expect(read("src/components/insights/QualityView.tsx")).toContain("InsightsQaStatsResponse");
    expect(read("src/components/insights/AISpendView.tsx")).toContain("AuditSummary");
    expect(read("src/components/insights/VoiceLatencyView.tsx")).toContain(
      "VoiceLatencyInsightsResponse",
    );
    expect(read("src/components/insights/HeatmapView.tsx")).toContain("heatmap");
    expect(read("src/server/register-api-routes.ts")).toContain("app.use(insightsRouter)");
    expect(read("src/server/register-api-routes.ts")).toContain("app.use(pipelineRouter)");
    expect(read("src/routes/voice-observability-routes.ts")).toContain('"/api/insights/latency"');
    expect(read("src/routes/qa-routes-v2.ts")).toContain('router.get("/stats"');
  });

  it("keeps channel empty states title-only", () => {
    const ops = read("src/lib/wireline-ops-design.ts");
    expect(ops).not.toMatch(/OPS_CHANNEL_EMPTY[\s\S]*eyebrow:/);
    expect(ops).not.toMatch(/OPS_CHANNEL_EMPTY[\s\S]*description:/);

    for (const path of [
      "src/components/WebhooksManager.tsx",
      "src/components/IntakeKeysManager.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain("WiredEyebrow");
    }
  });
});
