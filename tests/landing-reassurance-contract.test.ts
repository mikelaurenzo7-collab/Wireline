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
    expect(landing).toContain(
      '<AuthAccessPanel embedded initialMode="signup" showBrand={false} />',
    );
    expect(landing).toContain("Hire a Voice Bot.");
    expect(landing).toContain("With Its Own Number");
    expect(css).toContain(".landing-prestige__entrance");
    expect(css).toContain(".landing-prestige__desktop-only");
    expect(landing).not.toContain("00:42");
  });

  it("keeps free and paid capacity distinct without crowding the hero", () => {
    expect(landing).toContain("BOT_MARKETING_VOICE.activationLine");
    expect(product).toContain(
      'activationLine: "Answers calls, books appointments, and takes messages for your business."',
    );
    expect(landing).toContain("landing-prestige__directions");
    expect(landing).toContain("Find. Call. Book.");
    expect(landing).toContain("Answer. Qualify. Route.");
    expect(landing).not.toContain("Build free. Put it on a number when it is ready.");
    expect(landing).toContain(
      'const PUBLIC_PLAN_IDS = ["personal", "email", "voice-regular", "voice-email-regular"]',
    );
    for (const id of ["email", "voice-regular", "voice-email-regular"]) {
      expect(planById(id)?.catalogFamily).toBe("channels");
      expect(planById(id)?.max_agents).toBe(1);
    }
    expect(planById("email")).toMatchObject({
      voice_minutes_monthly: 0,
      included_phone_numbers: 0,
      included_mailboxes: 1,
    });
    expect(planById("voice-regular")).toMatchObject({
      voice_minutes_monthly: 250,
      included_phone_numbers: 1,
      included_mailboxes: 0,
    });
    expect(landing).toContain("plan.voice_minutes_monthly");
    expect(landing).toContain("plan.price_usd_monthly");
    expect(landing).toContain('id === "email"');
    expect(landing).toContain("canActivate(id)");
    expect(landing).toContain("Add its own email inbox and SMS.");
    expect(landing).toContain("Build and test free. No card required.");
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
