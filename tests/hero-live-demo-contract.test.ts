import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_EVENT_NAMES } from "../src/lib/product-events";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The homepage now demonstrates the product without executing provider work.
 * Live browser calls and phone-number fallbacks remain available on deliberate
 * demo surfaces, but an anonymous landing-page view must never incur runtime
 * cost or remove the reason to create an account.
 */
describe("homepage zero-runtime product theater", () => {
  it("renders a deterministic product scene instead of a live public demo", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(landing).toContain("wireline-device");
    expect(landing).toContain("OUTCOME_SIGNALS.map");
    expect(landing).toContain("WAVEFORM.map");
    expect(landing).not.toContain('import BrowserCallWidget from "./BrowserCallWidget"');
    expect(landing).not.toContain("<BrowserCallWidget");
    expect(landing).not.toContain("LANDING_PUBLIC_DEMO_AGENTS");
    expect(landing).not.toContain("HERO_DEMO_AGENT");
    expect(landing).not.toContain("href={`tel:");
  });

  it("keeps conversion and product exploration one click away", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(landing).toContain('const PRIMARY_CTA_PATH = "/signup?plan=personal"');
    expect(landing).toContain("Start Free");
    expect(landing).toContain('to="/features"');
    expect(landing).toContain('event: "landing_primary_cta_clicked"');
    expect(landing).toContain('source: "landing_product_theater"');
  });

  it("keeps live-demo instrumentation on intentional demo surfaces only", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const widget = read("src/components/marketing/BrowserCallWidget.tsx");

    expect(PRODUCT_EVENT_NAMES).toContain("landing_demo_clicked");
    expect(PRODUCT_EVENT_NAMES).toContain("landing_audience_selected");
    expect(widget).toContain('"landing_demo_clicked"');
    expect(landing).not.toContain('event: "landing_demo_clicked"');
    expect(landing).not.toContain('event: "landing_audience_selected"');
  });
});
