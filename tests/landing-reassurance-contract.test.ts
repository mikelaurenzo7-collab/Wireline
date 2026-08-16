import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("home landing launch clarity", () => {
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
  const theater = read("src/styles/landing-product-theater.css");

  it("keeps the homepage to one conversion scene", () => {
    expect(landing.match(/marketing-section marketing-section--screen/g)).toHaveLength(1);
    expect(landing).toContain("Always");
    expect(landing).toContain("On The Line");
    expect(landing).toContain("Start Free");
    expect(landing).toContain("Explore Product");
    expect(landing).not.toContain("MODE_OPTIONS");
    expect(landing).not.toContain("STRIPE_PLANS");
  });

  it("does not spend provider runtime on anonymous landing traffic", () => {
    expect(landing).not.toContain('import BrowserCallWidget from "./BrowserCallWidget"');
    expect(landing).not.toContain("<BrowserCallWidget");
    expect(landing).not.toContain("LANDING_PUBLIC_DEMO_AGENTS");
    expect(landing).not.toContain("href={`tel:");
    expect(landing).not.toContain("Runtime Balance");
    expect(landing).not.toContain("Wireline number");
  });

  it("uses a branded, accessible, reduced-motion-safe product preview", () => {
    expect(landing).toContain("<WirelineMark");
    expect(landing).toContain("OUTCOME_SIGNALS.map");
    expect(landing).toContain('aria-label="Animated preview');
    expect(theater).toContain("min-height: calc(");
    expect(theater).toContain("100dvh");
    expect(theater).toContain("prefers-reduced-motion");
    expect(theater).toContain("animation: none !important");
  });

  it("keeps title and control copy in the cased tiers without sentence punctuation", () => {
    expect(landing).toContain("Build free");
    expect(landing).toContain("Activate when ready");
    expect(landing).not.toContain("Always On The Line.");
    expect(landing).not.toContain("Start Free.");
    expect(landing).not.toContain("—");
    expect(landing).not.toContain("·");
  });
});
