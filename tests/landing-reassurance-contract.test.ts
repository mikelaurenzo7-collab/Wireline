import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("home landing launch clarity", () => {
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
  const product = read("src/lib/bot-product.ts");
  const css = read("src/styles/landing-prestige.css");

  it("keeps a concise product entrance instead of a brochure stack", () => {
    expect(landing).not.toContain("REASSURANCES");
    expect(landing).not.toContain("Live Video");
    expect(landing).not.toContain('variant="stage"');
    expect(landing).not.toContain("Illustrative Workflow");
    expect(landing).not.toContain("Booked and logged");
    expect(landing).toContain(
      '<AuthAccessPanel embedded initialMode="signup" showBrand={false} />',
    );
    expect(landing).toContain("PUT YOUR BOT");
    expect(landing).toContain("ON THE LINE");
    expect(css).toContain(".landing-prestige__entrance");
    expect(css).toContain(".landing-prestige__desktop-only");
    expect(landing).not.toContain("00:42");
  });

  it("keeps free and paid capacity distinct without crowding the hero", () => {
    expect(landing).toContain("BOT_MARKETING_VOICE.activationLine");
    expect(product).toContain(
      'activationLine: "Find leads. Make calls. Answer demand. Book the next step."',
    );
    expect(landing).toContain('variant="inline"');
    expect(landing).not.toContain("Build free. Put it on a number when it is ready.");
    expect(landing).toContain(
      'const PUBLIC_PLAN_IDS = ["personal", "starter", "team", "business"]',
    );
    expect(landing).toContain("plan.voice_minutes_monthly");
    expect(landing).toContain("plan.included_phone_numbers");
    expect(landing).toContain("Private simulation");
    expect(landing).toContain("Activate when ready");
  });

  it("keeps conversion explicit and owner control visible", () => {
    expect(landing).toContain('id="pricing"');
    expect(landing).toContain("to={signupHrefForPlan(id)}");
    expect(landing).toContain("YOUR LINE. YOUR RULES.");
    expect(landing).toContain('to="/security"');
    expect(landing).not.toContain("Put your first voice agent to work");
    expect(landing).not.toContain("—");
  });
});
