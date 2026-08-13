import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical Phone routes", () => {
  it("keeps generated assets and customer CTAs off retired client routes", () => {
    // PerformanceBenchmarks was removed 2026-08-13: nothing imported it, so
    // its retired-route hygiene was a gate on UI no user could reach.
    expect(existsSync(resolve(process.cwd(), "src/components/PerformanceBenchmarks.tsx"))).toBe(
      false,
    );

    const marketingKit = read("scripts/marketing-kit.mjs");
    const digest = read("src/lib/post-call-digest.ts");
    const escalation = read("src/routes/escalation-routes.ts");
    const onboarding = read("src/lib/wireline-onboarding-copy.ts");

    for (const source of [marketingKit, digest, escalation, onboarding]) {
      expect(source).not.toContain("trywireline.com/logs");
      expect(source).not.toContain('route: "/logs"');
      expect(source).not.toContain('route: "/triage"');
      expect(source).not.toContain('to="/call-logs"');
      expect(source).not.toContain('to="/outbound"');
    }

    expect(digest).toContain("https://trywireline.com/phone?tab=logs");
    expect(escalation).toContain("trywireline.com/phone?tab=logs");
    expect(marketingKit).toContain('route: "/phone?tab=logs"');
    expect(marketingKit).toContain('route: "/phone?tab=outbound"');
  });

  it("keeps only defensive legacy client redirects in the app route map", () => {
    const routes = read("src/routes/AppRoutes.tsx");

    expect(routes).toContain('path="/call-logs"');
    expect(routes).toContain('path="/logs"');
    expect(routes).toContain('to="/phone?tab=logs"');
    expect(routes).not.toContain('path="/triage"');
    expect(routes).not.toContain('path="/outbound"');
  });

  it("opens legacy Phone secondary-tab URLs on the intended Outbound views", () => {
    const phonePage = read("src/pages/PhonePage.tsx");

    expect(phonePage).toContain("legacyOutboundView");
    expect(phonePage).toContain('legacyOutboundView ? "outbound" : tabParam');
    expect(phonePage).toContain('searchParams.get("view") || legacyOutboundView');
  });

  it("keeps visual QA captures and generated CTAs on Connections, not retired Actions", () => {
    const visualProd = read("scripts/capture-prod-visual-qa.mjs");
    const visualLocal = read("scripts/capture-visual-qa.mjs");
    const playbooks = read("src/lib/integration-playbooks.ts");
    const ops = read("src/lib/wireline-ops-design.ts");
    const mobileControls = read("src/components/MobileBrowserUtilities.tsx");

    for (const source of [visualProd, visualLocal]) {
      expect(source).not.toContain('"/actions"');
      expect(source).not.toContain('"/actions/salesforce"');
      expect(source).toContain('"/connections"');
      expect(source).toContain('"/connections/salesforce"');
    }

    for (const source of [playbooks, ops, mobileControls]) {
      expect(source).not.toContain('to: "/actions"');
      expect(source).not.toContain('href: "/actions"');
      expect(source).not.toContain('connectPath: "/actions"');
      expect(source).toContain("/connections");
    }
  });

  it("keeps the callbacks tab a resilient authenticated read, not an AI-runtime gated endpoint", () => {
    const routes = read("src/routes/outbound-routes.ts");
    const panel = read("src/components/outbound/CallbacksPanel.tsx");

    expect(routes).not.toContain("claudeRateLimiter");
    expect(routes).toContain('"/api/callbacks"');
    expect(routes).toContain("authenticateUser");
    expect(routes).toContain("scheduled_at: schema.outboundLeads.callbackScheduledAt");
    expect(routes).toContain("status: schema.outboundLeads.status");
    expect(panel).toContain("cb.scheduled_at");
    expect(panel).toContain("cb.status");
  });
});
