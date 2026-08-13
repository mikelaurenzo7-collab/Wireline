import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_EVENT_NAMES } from "../src/lib/product-events";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The flagship browser voice demo belongs above the fold — "hear it now" is
 * the single strongest converter for a voice-AI product, and it used to be
 * one click + one page away on /showcase. Two top-of-funnel events
 * (landing_demo_clicked, landing_audience_selected) also existed in the
 * taxonomy with zero emit sites, so demo-interest and audience drop-off
 * were unmeasurable.
 */
describe("homepage hero live demo + funnel instrumentation", () => {
  it("renders the browser voice widget in the hero, not just a link to /showcase", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("import BrowserCallWidget");
    expect(landing).toContain("<BrowserCallWidget");
    expect(landing).toContain('id="hear-a-demo"');
  });

  it("falls back to a phone demo line when the browser demo can't run", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("fallback=");
    expect(landing).toContain("Live voice demo");
    expect(landing).toContain("Call live demo");
    expect(landing).toContain('mode: "phone"');
    const widget = read("src/components/marketing/BrowserCallWidget.tsx");
    // The widget renders the fallback instead of a dead button when the key
    // is missing.
    expect(widget).toContain("!VAPI_PUBLIC_KEY && fallback");
  });

  it("emits the two previously-dead funnel events", () => {
    expect(PRODUCT_EVENT_NAMES).toContain("landing_demo_clicked");
    expect(PRODUCT_EVENT_NAMES).toContain("landing_audience_selected");
    expect(read("src/components/marketing/BrowserCallWidget.tsx")).toContain(
      '"landing_demo_clicked"',
    );
    expect(read("src/components/marketing/WireAgentLanding.tsx")).toContain(
      '"landing_audience_selected"',
    );
    expect(read("src/components/marketing/WireAgentLanding.tsx")).toContain(
      'event: "landing_demo_clicked"',
    );
  });
});
