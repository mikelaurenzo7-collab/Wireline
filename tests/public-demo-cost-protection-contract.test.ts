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

  it("keeps platform authorization and assistant construction on the server", () => {
    expect(routes).toContain('fetch("https://api.vapi.ai/call/web"');
    expect(routes).toContain("process.env.VAPI_PRIVATE_KEY");
    expect(routes).toContain('router.post("/api/public/demo-vapi/call/web"');
    expect(hook).toContain('fetch("/api/public/demo-session"');
    expect(hook).toContain("new VapiSDK(token, absoluteProxyUrl)");
    expect(widget).toContain("useProtectedPublicDemo");
    expect(widget).not.toContain("VITE_VAPI_PUBLIC_KEY");
    expect(widget).not.toContain("/api/public/assistant/");
  });

  it("keeps the compatibility route metadata-only", () => {
    const compatibilityStart = routes.indexOf('router.get("/api/public/assistant/:agentName"');
    const compatibilityEnd = routes.indexOf(
      'router.post("/api/public/demo-session"',
      compatibilityStart,
    );
    const compatibilityBlock = routes.slice(compatibilityStart, compatibilityEnd);
    expect(compatibilityBlock).toContain('mode: "protected_browser_preview"');
    expect(compatibilityBlock).toContain('sessionEndpoint: "/api/public/demo-session"');
    expect(compatibilityBlock).not.toContain("buildPublicBrowserAssistant(agent)");
    expect(compatibilityBlock).not.toContain("systemPrompt");
    expect(compatibilityBlock).not.toContain("voiceId");
    expect(compatibilityBlock).not.toContain("transcriber");
  });

  it("checks protected-demo availability before asking for microphone access", () => {
    const sessionRequest = hook.indexOf('fetch("/api/public/demo-session"');
    const permissionRequest = hook.indexOf("navigator.mediaDevices.getUserMedia");
    expect(sessionRequest).toBeGreaterThan(-1);
    expect(permissionRequest).toBeGreaterThan(sessionRequest);
  });

  it("caps duration, disables retained artifacts, and exposes no real tools", () => {
    const policy = read("src/lib/public-browser-demo.ts");
    expect(policy).toContain("PUBLIC_BROWSER_DEMO_MAX_SECONDS = 45");
    expect(routes).toContain("maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS");
    expect(routes).toContain("buildPublicBrowserDemoArtifactPlan()");
    expect(policy).toContain("recordingEnabled: false");
    expect(policy).toContain("videoRecordingEnabled: false");
    expect(policy).toContain("pcapEnabled: false");
    expect(policy).toContain("loggingEnabled: false");
    expect(policy).toContain("transcriptPlan: { enabled: false }");
    expect(routes).toContain("serverMessages: []");
    expect(routes).not.toContain("tools:");
  });

  it("binds one-use tickets to the browser and fails closed on budget infrastructure", () => {
    expect(ticket).toContain("timingSafeEqual");
    expect(ticket).toContain("publicDemoIpFingerprint");
    expect(ticket).toContain("PUBLIC_DEMO_TICKET_TTL_SECONDS = 120");
    expect(budget).toContain("distributedLimiterStatus");
    expect(budget).toContain("failClosedOnError: true");
    expect(budget).toContain('bucket: "public-demo-one-use-ticket"');
    expect(budget).toContain('bucket: "public-demo-global-daily"');
    expect(budget).toContain("WIRELINE_PUBLIC_DEMO_DAILY_SESSION_CEILING");
    expect(routes).toContain("requireSameOrigin(req)");
  });

  it("keeps the live proof and truthful phone fallback inside the approved console", () => {
    expect(landing).toContain("<BrowserCallWidget");
    expect(landing).toContain('variant="stage"');
    expect(landing).toContain("href={`tel:${HERO_DEMO_AGENT.tel}`}");
    expect(landing).toContain('aria-label="Call the Public Demo Line"');
    expect(landing).toContain("Call Demo Line");
    expect(hook).toContain("Try the public demo line instead");
    expect(widget).toContain("Public demo line available");
    expect(widget).toContain("Standard carrier rates may apply");
    expect(widget).toContain("No retained call artifacts");
  });
});
