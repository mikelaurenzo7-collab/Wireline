import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public browser demo cost protection", () => {
  const routes = read("src/routes/marketing-runtime-routes.ts");
  const budget = read("src/lib/public-demo-budget.ts");
  const ticket = read("src/lib/public-demo-ticket.ts");
  const hook = read("src/hooks/useProtectedPublicDemo.ts");
  const widget = read("src/components/marketing/BrowserCallWidget.tsx");
  const landing = read("src/components/marketing/WireAgentLanding.tsx");

  it("keeps Vapi authorization and assistant configuration on the server", () => {
    expect(routes).toContain('fetch("https://api.vapi.ai/call/web"');
    expect(routes).toContain("process.env.VAPI_PRIVATE_KEY");
    expect(routes).toContain('router.post("/api/public/demo-vapi/call/web"');
    expect(hook).toContain('fetch("/api/public/demo-session"');
    expect(hook).toContain("new VapiSDK(token, absoluteProxyUrl)");
    expect(widget).not.toContain("VITE_VAPI_PUBLIC_KEY");
    expect(widget).not.toContain("/api/public/assistant/");
  });

  it("caps duration, disables artifacts, and permits no real tools", () => {
    expect(budget).toContain("PUBLIC_DEMO_MAX_DURATION_SECONDS = 45");
    expect(routes).toContain("maxDurationSeconds: PUBLIC_DEMO_MAX_DURATION_SECONDS");
    expect(routes).toContain("recordingEnabled: false");
    expect(routes).toContain("videoRecordingEnabled: false");
    expect(routes).toContain("pcapEnabled: false");
    expect(routes).toContain("loggingEnabled: false");
    expect(routes).toContain("transcriptPlan: { enabled: false }");
    expect(routes).toContain("serverMessages: []");
    expect(routes).not.toContain("tools:");
  });

  it("binds one-use tickets to the request and fails closed on budget infrastructure", () => {
    expect(ticket).toContain("timingSafeEqual");
    expect(ticket).toContain("publicDemoIpFingerprint");
    expect(ticket).toContain("PUBLIC_DEMO_TICKET_TTL_SECONDS = 75");
    expect(budget).toContain("distributedLimiterStatus");
    expect(budget).toContain("failClosedOnError: true");
    expect(budget).toContain('bucket: "public-demo-one-use-ticket"');
    expect(budget).toContain('bucket: "public-demo-global-daily"');
    expect(budget).toContain("WIRELINE_PUBLIC_DEMO_DAILY_SESSION_CEILING");
    expect(routes).toContain("requireSameOrigin(req)");
  });

  it("keeps the live proof inside the singular landing scene with no public phone fallback", () => {
    expect(landing).toContain("useProtectedPublicDemo");
    expect(landing).toContain("Talk Live");
    expect(landing).toContain("Protected Demo");
    expect(landing).not.toContain("LANDING_PUBLIC_DEMO_AGENTS");
    expect(landing).not.toContain("href={`tel:");
    expect(landing).not.toContain("<BrowserCallWidget");
  });
});
