import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const workspacePageIntroTags = (source: string) =>
  source.match(/<WorkspacePageIntro\b[\s\S]*?\/>/g) ?? [];

const AUTHENTICATED_PAGE_INTROS = [
  "src/pages/ClientAppsPage.tsx",
  "src/pages/EmailPage.tsx",
  "src/pages/TemplatesPage.tsx",
  "src/pages/KnowledgePage.tsx",
  "src/pages/ApprovalsPage.tsx",
] as const;

describe("authenticated minimal copy contract", () => {
  it("keeps Connections focused on customer connection actions", () => {
    const connectionsPage = read("src/pages/ConnectionsPage.tsx");
    const introTags = workspacePageIntroTags(connectionsPage);

    expect(connectionsPage).toContain("MailboxConnectionCard");
    expect(connectionsPage).toContain("CrmConnectionCard");
    expect(connectionsPage).toContain("Business Tools");
    expect(connectionsPage).not.toMatch(/IntegrationOperatingMap|data-wireline-integration-map/);
    expect(introTags).toHaveLength(1);
    expect(introTags[0]).toContain('title="Connections"');
    expect(introTags[0]).not.toMatch(/\bdescription=/);
    expect(introTags[0]).not.toMatch(/\beyebrow=/);
  });

  it("keeps workspace page intros title-first without coaching copy", () => {
    const intro = read("src/components/layout/WorkspacePageFrame.tsx");
    expect(intro).toContain("Minimal page title");
    expect(intro).not.toContain("eyebrow?:");

    for (const path of [...AUTHENTICATED_PAGE_INTROS, "src/pages/ConnectionsPage.tsx"]) {
      const tags = workspacePageIntroTags(read(path));
      expect(tags.length, `${path} should render a WorkspacePageIntro`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, `${path} WorkspacePageIntro should stay title-first`).not.toMatch(
          /\bdescription=/,
        );
        expect(tag, `${path} WorkspacePageIntro should not restore an eyebrow`).not.toMatch(
          /\beyebrow=/,
        );
      }
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

  it("keeps the new shell and Studio chrome label-first", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const more = read("src/components/layout/MobileNavMoreSheet.tsx");
    const studio = read("src/components/StudioWorkroom.tsx");

    expect(shell).not.toContain(">Current Bot</span>");
    expect(shell).not.toContain('className="wl-shell-account-meta"');
    expect(more).toContain(">More</SheetTitle>");
    expect(more).toContain('<SheetDescription className="sr-only">');
    expect(more).not.toContain("item.description");
    expect(studio).not.toContain("Changes stay reviewable");
    expect(studio).not.toContain("Shift+Enter line break");
  });

  it("keeps the Studio Build empty canvas distinct from the composer prompt", () => {
    const studio = read("src/components/StudioWorkroom.tsx");
    const emptyHeading = studio.match(
      /<h2 className="text-2xl font-semibold text-foreground">[\s\S]*?<\/h2>/,
    )?.[0];
    const composerPlaceholder = studio.match(
      /placeholder=\{\s*mode === "test" \? "Ask as a customer…" : "([^"]+)"/,
    )?.[1];

    expect(emptyHeading).toContain("Try a customer question");
    expect(emptyHeading).toContain("What should we change?");
    expect(emptyHeading).not.toMatch(/Describe What Should Change/i);
    expect(emptyHeading).not.toMatch(/describe what should change/i);
    expect(composerPlaceholder).toBe("Describe what should change");
    expect(studio).not.toContain("Describe a change…");
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
