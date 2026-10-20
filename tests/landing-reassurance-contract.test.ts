import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planById } from "../src/lib/plan-catalog";

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
    expect(landing).not.toContain("<AuthAccessPanel");
    expect(landing).toContain('to={signupHrefForPlan("personal")}');
    expect(landing).toContain("<span>With a Computer,</span>");
    expect(landing).toContain("<span>and Email Address.</span>");
    expect(css).toContain(".landing-prestige__hero-mark");
    expect(css).not.toMatch(/\.landing-prestige__(?:auth|entrance|desktop-only)\b/);
    expect(landing).not.toContain("00:42");
  });

  it("keeps free and paid capacity distinct without crowding the hero", () => {
    expect(landing).not.toContain("landing-prestige__promise");
    expect(product).not.toContain("activationLine:");
    expect(landing).toContain("landing-prestige__directions");
    expect(landing).toContain("Answer. Book.");
    expect(landing).toContain("Plan. Coordinate.");
    expect(landing).not.toContain("Build free. Put it on a number when it is ready.");
    expect(landing).toContain(
      'const PUBLIC_PLAN_IDS = ["personal", "email", "voice", "voice-email"]',
    );
    for (const id of ["email", "voice", "voice-email"]) {
      expect(planById(id)?.catalogFamily).toBe("channels");
      expect(planById(id)?.max_agents).toBe(1);
    }
    expect(planById("email")).toMatchObject({
      voice_minutes_monthly: 0,
      included_phone_numbers: 0,
      included_mailboxes: 1,
    });
    expect(planById("voice")).toMatchObject({
      voice_minutes_monthly: 50,
      included_phone_numbers: 1,
      included_mailboxes: 0,
    });
    expect(landing).toContain("plan.voice_minutes_monthly");
    expect(landing).toContain("plan.price_usd_monthly");
    expect(landing).toContain('id === "email"');
    expect(landing).toContain("canActivate(id)");
    expect(landing).toContain('className="landing-prestige__reassurance">No card required.');
    expect(landing).toContain('className="landing-prestige__activation" role="status"');
    expect(landing).not.toMatch(/coming soon/i);
    expect(landing.indexOf('className="landing-prestige__direction is-inbound"')).toBeLessThan(
      landing.indexOf('className="landing-prestige__direction is-outbound"'),
    );
    expect(landing).toContain("Private simulation");
    expect(landing).toContain("Upgrade for live work");
  });

  it("keeps conversion explicit and owner control visible", () => {
    expect(landing).toContain('id="pricing"');
    expect(landing).toContain("to={signupHrefForPlan(id)}");
    expect(landing).toContain("Your Line. Your Rules.");
    expect(landing).toContain('to="/security"');
    expect(landing).not.toContain("Put your first voice agent to work");
    expect(landing).not.toContain("—");
  });
});
