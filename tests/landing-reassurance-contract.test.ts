import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path, "utf8");
describe("minimal landing launch clarity", () => {
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
  it("keeps acquisition separate from billing, browser work, and public paid calling", () => {
    expect(landing).toContain('signedIn ? "/studio" : "/signup"');
    expect(landing).toContain('to="/pricing"');
    expect(landing).not.toMatch(
      /HOME_PLAN_IDS|STRIPE_PLANS|BrowserCallWidget|ClonedMedia|tel:|landing-prestige__price/,
    );
    expect(landing).not.toMatch(/coming soon|Runtime Balance|\$19|\$12/i);
  });
  it("keeps three product assets visible without requiring interaction", () => {
    expect(landing).toContain('aria-labelledby="landing-prestige-showcase-title"');
    expect(landing).toContain("The Bot Gets:");
    expect(landing).toContain("landing-prestige__showcase-grid");
    expect(landing).toContain("<CapabilityPreview channel={id} />");
    expect(landing).not.toContain('role="tablist"');
    expect(landing).not.toContain('role="tabpanel"');
    expect(landing).not.toMatch(
      /CHOOSE FROM A CATALOG|clone your own|Explore \$\{example.label\}/i,
    );
    expect(landing).not.toContain("MarketingChromeBar");
  });
});
