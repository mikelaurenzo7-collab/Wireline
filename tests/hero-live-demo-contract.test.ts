import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_EVENT_NAMES } from "../src/lib/product-events";
import {
  PUBLIC_BROWSER_DEMO_MAX_SECONDS,
  PUBLIC_BROWSER_DEMO_REQUESTS_PER_MINUTE,
  buildPublicBrowserDemoArtifactPlan,
} from "../src/lib/public-browser-demo";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("homepage hero live demo + funnel instrumentation", () => {
  it("renders the flagship browser voice proof above the fold", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("import BrowserCallWidget");
    expect(landing).toContain("<BrowserCallWidget");
    expect(landing).toContain('variant="stage"');
    expect(landing).toContain('id="hear-a-demo"');
    expect(landing).toContain("landing-console");
  });

  it("falls back to the public phone demo without removing the proof console", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("fallback=");
    expect(landing).toContain("Hear It Live");
    expect(landing).toContain("href={`tel:${HERO_DEMO_AGENT.tel}`}");
    expect(landing).toContain('mode: "phone"');

    const widget = read("src/components/marketing/BrowserCallWidget.tsx");
    expect(widget).toContain('variant?: "compact" | "stage"');
    expect(widget).toContain("browserUnavailable");
    expect(widget).toContain("activateFallback");
    expect(widget).toContain("(!VAPI_PUBLIC_KEY || browserUnavailable) && Boolean(fallback)");
    expect(widget).toContain('variant !== "stage"');
    expect(widget).toContain("Public Demo Line");
    expect(widget).toContain("Standard carrier rates may apply");
  });

  it("hard-caps browser preview spend and disables retained provider artifacts", () => {
    expect(PUBLIC_BROWSER_DEMO_MAX_SECONDS).toBe(90);
    expect(PUBLIC_BROWSER_DEMO_REQUESTS_PER_MINUTE).toBe(6);
    expect(buildPublicBrowserDemoArtifactPlan()).toEqual({
      recordingEnabled: false,
      videoRecordingEnabled: false,
      pcapEnabled: false,
      loggingEnabled: false,
      transcriptPlan: { enabled: false },
    });

    const route = read("src/routes/marketing-runtime-routes.ts");
    expect(route).toContain("maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS");
    expect(route).toContain("artifactPlan: buildPublicBrowserDemoArtifactPlan()");
    expect(route).toContain("max: PUBLIC_BROWSER_DEMO_REQUESTS_PER_MINUTE");

    const widget = read("src/components/marketing/BrowserCallWidget.tsx");
    expect(widget).toContain("PUBLIC_BROWSER_DEMO_MAX_SECONDS * 1000");
    expect(widget).toContain("ends automatically after");
  });

  it("emits the live-demo, audience, and primary-action funnel events", () => {
    expect(PRODUCT_EVENT_NAMES).toContain("landing_demo_clicked");
    expect(PRODUCT_EVENT_NAMES).toContain("landing_audience_selected");
    expect(PRODUCT_EVENT_NAMES).toContain("landing_primary_cta_clicked");
    expect(read("src/components/marketing/BrowserCallWidget.tsx")).toContain(
      'event: "landing_demo_clicked"',
    );
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain('event: "landing_audience_selected"');
    expect(landing).toContain('event: "landing_primary_cta_clicked"');
  });
});
