import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const withoutComments = (value: string) =>
  value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("design system polish e2e verified wins", () => {
  it("keeps channel proof concise and avoids repeating it in the hero", () => {
    const features = withoutComments(read("src/pages/Features.tsx"));
    const landing = withoutComments(read("src/components/marketing/WireAgentLanding.tsx"));

    expect(features).not.toContain("wl-features-intro__steps");
    expect(features).toContain("A Bot for Your Life and Work");
    expect(features).not.toContain("MARKETING_VOICE.channelProof.map");
    expect(features).not.toMatch(/wl-channel-chip[\s\S]{0,180}<Icon\b/);
    expect(landing).not.toContain("landing-prestige__promise");
    expect(landing).not.toContain("landing-prestige__getting-started");
    expect(landing).toContain("landing-prestige__directions");
    expect(landing).toContain("Answer. Book.");
    expect(landing).toContain("Plan. Coordinate.");
    expect(landing).not.toContain("HERO_CHANNEL_ORDER");
    expect(landing).not.toContain("HERO_CHANNELS.map");
    expect(landing).not.toContain('aria-label="BotBound channels"');
    expect(landing).not.toContain("landing-home__solution-icon");
    expect(landing).not.toContain("landing-home__compact-icon");
    expect(landing).not.toContain("landing-stage__lane-icon");
  });

  it("keeps trust and retired Live Video titles period-free and icon-light", () => {
    const trust = withoutComments(read("src/components/marketing/TrustSignals.tsx"));
    const spotlight = withoutComments(read("src/components/marketing/LiveVideoSpotlight.tsx"));

    expect(trust).toContain("Built to Stay Under Your Control");
    expect(trust).not.toContain("Built to stay under your control.");
    expect(trust).not.toContain("LockKeyhole");
    expect(spotlight).not.toMatch(/CHANNELS = \[[\s\S]*icon:/);
  });

  it("puts Blog and Compare CTAs in the shared Title Case action tier", () => {
    const blog = withoutComments(read("src/pages/Blog.tsx"));
    const compare = withoutComments(read("src/pages/Compare.tsx"));

    expect(blog).toContain("marketing-btn-primary");
    expect(blog).toContain("Start Free");
    expect(blog).toContain("See Features");
    expect(blog).not.toMatch(/START FREE|SEE FEATURES/);
    expect(blog).not.toContain('from "../components/atoms"');
    expect(compare).toContain("Start Free");
    expect(compare).not.toMatch(/START FREE|SEE PRICING/);
    expect(compare).not.toContain(">Start free</");
  });

  it("drops redundant plan and difference icons on Pricing and Compare", () => {
    const pricing = withoutComments(read("src/pages/Pricing.tsx"));
    const compare = withoutComments(read("src/pages/Compare.tsx"));

    expect(pricing).not.toContain("WalletCards");
    expect(pricing).not.toContain("Sparkles");
    expect(pricing).not.toContain("icon: Users");
    expect(pricing).toContain("Create a Free Bot");
    expect(compare).not.toMatch(/DIFFERENCES = \[[\s\S]*icon:/);
  });

  it("keeps Bot labels in Title Case and BotBound in canonical mixed case", () => {
    const copy = read("src/lib/product-copy.ts");
    expect(copy).toContain('createHeadline: "Create Your Bot"');
    expect(copy).toContain('runHeadline: "Your Bot Is Live"');
    expect(copy).toContain('createCta: "Create Bot"');
    expect(copy).toContain('emptyTitle: "Your Bot"');
    expect(copy).not.toContain('emptyTitle: "Your Bot."');
    expect(copy).toContain(
      "Treat workspace architecture as product proof, never as a marketing headline.",
    );
    expect(copy).toContain(
      "Render the BotBound brand name in canonical mixed case everywhere it is customer-visible",
    );
  });

  it("keeps marketing eyebrows in the uppercase label tier after the body reset", () => {
    const polish = read("src/styles/e2e-design-polish.css");
    expect(polish).toContain(".wl-eyebrow");
    expect(polish).toMatch(
      /\.marketing-surface\s+:is\(\s*\.wl-eyebrow[\s\S]*?text-transform:\s*uppercase;/,
    );
    expect(polish).not.toContain("#demo-lines");
    expect(polish).not.toContain(".wl-showcase-preview__note");
  });
});
