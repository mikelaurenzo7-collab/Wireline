import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical Phone routes", () => {
  it("keeps generated assets and customer CTAs off retired client routes", () => {
    const marketingKit = read("scripts/marketing-kit.mjs");
    const digest = read("src/lib/post-call-digest.ts");
    const escalation = read("src/routes/escalation-routes.ts");
    const onboarding = read("src/lib/wireline-onboarding-copy.ts");
    const performance = read("src/components/PerformanceBenchmarks.tsx");

    for (const source of [marketingKit, digest, escalation, onboarding, performance]) {
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
});
