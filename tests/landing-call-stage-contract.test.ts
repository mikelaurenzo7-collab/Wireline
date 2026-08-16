import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("homepage call-stage composition", () => {
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
  const stage = read("src/components/marketing/LandingCallStage.tsx");
  const styles = [
    read("src/styles/landing-call-stage.css"),
    read("src/styles/landing-call-stage-responsive.css"),
  ].join("\n");

  it("makes one interactive voice-agent object the homepage focal point", () => {
    expect(landing).toContain('import LandingCallStage from "./LandingCallStage"');
    expect(landing).toContain("<LandingCallStage");
    expect(landing).toContain("<BrowserCallWidget");
    expect(stage).toContain("<AgentFace");
    expect(stage).toContain("Now Handling");
    expect(stage).toContain("Ready When You Are");
  });

  it("keeps the opening frame out of the generic SaaS catalog pattern", () => {
    expect(landing).not.toContain("<MarketingHero");
    expect(landing).not.toContain("<MarketingStickyCta");
    expect(landing).not.toContain("sm:grid-cols-2 lg:grid-cols-4");
    expect(landing).not.toContain("Most Popular");
    expect(landing).toContain("PLAN_PREVIEW.map");
  });

  it("retains truthful interaction and accessibility boundaries", () => {
    expect(landing).toContain('aria-label="Agent work lane"');
    expect(stage).toContain("voice agent demo");
    expect(stage).toContain("not a video-presenter claim");
    expect(styles).toContain("prefers-reduced-motion");
    expect(styles).toContain("@media (max-width: 860px)");
  });
});
