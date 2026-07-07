import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_VOICE } from "../src/lib/product-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product voice cohesion", () => {
  it("keeps marketing hero strings in one shared module", () => {
    expect(MARKETING_VOICE.headline).toBe("Wire your agent.");
    expect(MARKETING_VOICE.subline).toContain("personal assistants");
    expect(MARKETING_VOICE.subline).toContain("call centers and sales teams");
    expect(MARKETING_VOICE.subline).toContain("answers, routes, books, qualifies");
    expect(MARKETING_VOICE.proof).toEqual([
      "Answers the line",
      "Books and qualifies",
      "Texts every outcome",
    ]);
  });

  it("wires landing and workroom surfaces to shared voice constants", () => {
    const landing = read("src/components/marketing/PrecisionLanding.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const extension = read("apps/browser-extension/panel/index.html");
    expect(landing).toContain("MARKETING_VOICE");
    expect(workroom).toContain("WORKSPACE_VOICE");
    expect(extension).toContain(MARKETING_VOICE.extensionLead);
  });

  it("keeps authenticated page map intentional", () => {
    const routes = read("src/routes/AppRoutes.tsx");
    expect(routes).toContain('path="/overview"');
    expect(routes).toContain('path="/studio"');
    expect(routes).toContain('path="/templates"');
    expect(routes).toContain('path="/knowledge"');
    expect(routes).toContain('path="/connections"');
    expect(routes).toContain('path="/call-logs"');
    expect(routes).toContain('path="/logs"');
    expect(routes).toContain('to="/phone?tab=logs"');
    expect(routes).toContain('path="/phone"');
    expect(routes).toContain("AuthNotFound");
    expect(routes).toContain('path="/inbox"');
    expect(routes).toContain('path="/apps"');
    expect(routes).toContain('path="/settings"');
    expect(routes).toContain('path="/admin"');
    expect(routes).toContain("RouteFallback");
    expect(routes).toContain('path="/actions/salesforce"');
    expect(routes).toContain('to="/connections/salesforce"');
    expect(routes).not.toContain('path="/dashboard"');
  });

  it("keeps top-level workspace pages mounted to the current surfaces", () => {
    expect(read("src/pages/TemplatesPage.tsx")).toContain("AgentTemplates");
    expect(read("src/pages/AgentStudioHomeClaude.tsx")).toContain("CreateAgentDialog");
    expect(read("src/pages/OverviewPage.tsx")).toContain("Workspace metrics");
    expect(read("src/pages/OverviewPage.tsx")).toContain("Recent calls");
    expect(read("src/components/outbound/OutboundHub.tsx")).toContain("CampaignsPanel");
    expect(read("src/components/outbound/OutboundHub.tsx")).toContain("IntakeKeysManager");
  });

  it("keeps authenticated surfaces action-first, not explanatory", () => {
    const docs = read("docs/README.md");
    expect(docs).toContain("Public pages explain. Authenticated pages execute.");
    expect(docs).toContain("Use labels, tabs, icons, state, and clear next actions");
    expect(docs).toContain(
      "Phone / Call History and Analytics may explain history, coaching, exports, and insights",
    );
  });

  it("preserves call history as the allowed explanatory analytics surface", () => {
    const calls = read("src/components/CallLogsClaude.tsx");
    expect(calls).toContain("Analytics");
    expect(calls).toContain("coaching_note");
    expect(calls).toContain("qa_score");
    expect(calls).toContain("lead_score");
  });
});
