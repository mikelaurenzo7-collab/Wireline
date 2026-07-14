import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("activation path contract", () => {
  it("routes fresh signups into studio create flow", () => {
    const authRedirect = read("src/lib/auth-redirect.ts");
    expect(authRedirect).toContain("/studio?create=1");
  });

  it("documents ops activation checklist", () => {
    const doc = read("docs/OPS_CREDENTIALS_CHECKLIST_2026-07-07.md");
    expect(doc).toContain("FEDERAL_DNC");
    expect(doc).toContain("SENTRY_DSN");
  });

  it("mounts activation checklist on overview", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    expect(overview).toContain("ActivationChecklist");
    expect(overview).toContain("FirstRunLaunchpad");
    expect(overview).toContain("Put one customer-facing job to work today.");
    expect(overview).toContain("Do not configure everything.");
    expect(overview).toContain("degraded && !hasAgents");
    expect(overview).toContain("WorkspaceRecovery");
  });

  it("aligns activation checklist with fleet setup progress (6 steps, live call gate)", () => {
    const checklist = read("src/components/ActivationChecklist.tsx");
    const progress = read("src/lib/fleet-setup-progress.ts");
    const dashboardRoutes = read("src/routes/dashboard-routes.ts");
    expect(progress).toContain("FLEET_SETUP_STEP_COUNT = 6");
    expect(checklist).toContain('id: "live"');
    expect(checklist).toContain('id: "test"');
    expect(checklist).toContain('id: "review"');
    expect(checklist).toContain('href: "/approvals"');
    expect(checklist).toContain("Test freely in Studio.");
    expect(progress).toContain("browserTested");
    expect(progress).toContain("agentId: primaryAgentId || null");
    expect(progress).toContain("knowledgeCount");
    expect(progress).toContain("agentId=${encodeURIComponent(primaryAgentId)}");
    expect(checklist).toContain('params.set("agent", p.agentId)');
    expect(dashboardRoutes).toContain('req.query.agentId === "string"');
    expect(dashboardRoutes).toContain("tenantCallFilter");
  });

  it("keeps post-create setup honest and focused", () => {
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");
    expect(wizard).toContain('["train", "wire", "test"]');
    expect(wizard).not.toContain('event: "test_call_completed"');
    expect(wizard).toContain("testCompleted ?");
    expect(wizard).toContain("onTestCompleted");
    expect(wizard).toContain("Finish without a test");
    expect(copy).toContain("Optional: review what your agent learned");
    expect(copy).toContain('label: "Number"');
  });
});
