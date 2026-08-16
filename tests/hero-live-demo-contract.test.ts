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
  it("renders the flagship protected voice proof above the fold", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("import BrowserCallWidget");
    expect(landing).toContain("<BrowserCallWidget");
    expect(landing).toContain('variant="stage"');
    expect(landing).toContain('id="hear-a-demo"');
    expect(landing).toContain("landing-console");
    expect(landing).toContain("Illustrative Workflow");
    expect(landing).toContain("From first answer to confirmed next step.");
    expect(landing).toContain('aria-label="Core agent channels"');
    expect(landing).not.toContain("00:42");

    const widget = read("src/components/marketing/BrowserCallWidget.tsx");
    expect(widget).toContain("useProtectedPublicDemo");
    expect(widget).toContain("Protected browser preview");
    expect(widget).toContain("No retained call artifacts.");
    expect(widget).not.toContain("VITE_VAPI_PUBLIC_KEY");
    expect(widget).not.toContain(" · ");
  });

  it("falls back to the public phone demo without removing the proof console", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("fallback=");
    expect(landing).toContain("Hear It Live");
    expect(landing).toContain("href={`tel:${HERO_DEMO_AGENT.tel}`}");
    expect(landing).toContain('aria-label="Call the Public Demo Line"');
    expect(landing).toContain('mode: "phone"');

    const widget = read("src/components/marketing/BrowserCallWidget.tsx");
    const hook = read("src/hooks/useProtectedPublicDemo.ts");
    expect(widget).toContain('variant?: "compact" | "stage"');
    expect(widget).toContain("Public demo line available");
    expect(widget).toContain("Standard carrier rates may apply");
    expect(widget).toContain("{fallback}");
    expect(hook).toContain("Try the public demo line instead");
  });

  it("hard-caps browser preview spend and disables retained provider artifacts", () => {
    expect(PUBLIC_BROWSER_DEMO_MAX_SECONDS).toBe(45);
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
    expect(route).toContain('router.post("/api/public/demo-session"');
    expect(route).toContain('router.post("/api/public/demo-vapi/call/web"');

    const hook = read("src/hooks/useProtectedPublicDemo.ts");
    expect(hook).toContain("(durationSeconds + 3) * 1000");
    expect(hook).toContain("PROTECTED_DEMO_ASSISTANT_SENTINEL");
  });

  it("emits live-demo, audience, and primary-action funnel events", () => {
    expect(PRODUCT_EVENT_NAMES).toContain("landing_demo_clicked");
    expect(PRODUCT_EVENT_NAMES).toContain("landing_audience_selected");
    expect(PRODUCT_EVENT_NAMES).toContain("landing_primary_cta_clicked");
    expect(read("src/hooks/useProtectedPublicDemo.ts")).toContain(
      'event: "landing_demo_clicked"',
    );
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain('event: "landing_audience_selected"');
    expect(landing).toContain('event: "landing_primary_cta_clicked"');
  });
});
