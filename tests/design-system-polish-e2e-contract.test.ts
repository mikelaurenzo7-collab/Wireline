import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const withoutComments = (value: string) =>
  value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Verified design-system polish wins: Title Case labels, no terminal periods on
 * cased titles, no redundant channel/plan Lucide badges, little chrome.
 */
describe("design system polish e2e verified wins", () => {
  it("keeps channel chips text-only on Features and the home console", () => {
    const features = withoutComments(read("src/pages/Features.tsx"));
    const landing = withoutComments(read("src/components/marketing/WireAgentLanding.tsx"));

    expect(features).toContain('const CHANNEL_CAPABILITIES = ["Voice", "Text / SMS", "Email"]');
    expect(features).not.toMatch(/wl-channel-chip[\s\S]{0,180}<Icon\b/);
    expect(landing).toContain('const CORE_CHANNELS = ["Voice", "Text", "Email"]');
    expect(landing).not.toContain("landing-home__solution-icon");
    expect(landing).not.toContain("landing-home__compact-icon");
    expect(landing).not.toContain("landing-stage__lane-icon");
  });

  it("keeps trust and Live Video titles period-free and icon-free", () => {
    const trust = withoutComments(read("src/components/marketing/TrustSignals.tsx"));
    const spotlight = withoutComments(read("src/components/marketing/LiveVideoSpotlight.tsx"));

    expect(trust).toContain("Built to Stay Under Your Control");
    expect(trust).not.toContain("Built to stay under your control.");
    expect(trust).not.toContain("LockKeyhole");
    expect(trust).not.toContain("wl-trust-point__title mt-4");
    expect(spotlight).toContain("Your Voice Agent, Now on Screen");
    expect(spotlight).not.toContain("Your voice agent, now on screen.");
    expect(spotlight).toContain("Build a Business Agent");
    expect(spotlight).not.toMatch(/CHANNELS = \[[\s\S]*icon:/);
  });

  it("puts Blog and Compare CTAs in the shared marketing button tier", () => {
    const blog = withoutComments(read("src/pages/Blog.tsx"));
    const compare = withoutComments(read("src/pages/Compare.tsx"));

    expect(blog).toContain("marketing-btn-primary");
    expect(blog).toContain("Start Free");
    expect(blog).toContain("See Features");
    expect(blog).not.toContain('from "../components/atoms"');
    expect(compare).toContain("Start Free");
    expect(compare).not.toContain(">Start free</");
    expect(compare).not.toContain('"Start free"');
  });

  it("drops redundant plan and difference icons on Pricing and Compare", () => {
    const pricing = withoutComments(read("src/pages/Pricing.tsx"));
    const compare = withoutComments(read("src/pages/Compare.tsx"));

    expect(pricing).not.toContain("WalletCards");
    expect(pricing).not.toContain("Sparkles");
    expect(pricing).not.toContain("icon: Users");
    expect(pricing).toContain("Build Free");
    expect(compare).not.toMatch(/DIFFERENCES = \[[\s\S]*icon:/);
  });

  it("keeps workspace create labels in Title Case without terminal periods", () => {
    const copy = read("src/lib/product-copy.ts");
    expect(copy).toContain('createHeadline: "Build Your Next Voice Agent"');
    expect(copy).toContain('runHeadline: "Your Voice Agent Is Live"');
    expect(copy).toContain('createCta: "Create Personal Voice Agent"');
    expect(copy).toContain('emptyTitle: "Your Personal Voice Agent"');
    expect(copy).not.toContain('emptyTitle: "Your personal voice agent."');
  });
});
