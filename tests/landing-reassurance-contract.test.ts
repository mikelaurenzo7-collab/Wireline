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
  it("keeps channels accessible by mouse, touch, and keyboard", () => {
    expect(landing).toContain('role="tablist"');
    expect(landing).toContain('role="tabpanel"');
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) expect(landing).toContain(key);
    expect(landing).toContain("onClick={() => setSelected(index)}");
    expect(landing).toContain("CHOOSE FROM A CATALOG OF VOICES OR CLONE YOUR OWN");
  });
});
