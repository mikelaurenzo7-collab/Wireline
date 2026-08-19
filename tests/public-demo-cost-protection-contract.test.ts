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
  const showcase = read("src/pages/Showcase.tsx");
  const server = read("server.ts");

  it("keeps platform authorization and assistant construction on the server", () => {
    expect(routes).toContain('"/api/public/demo-xai-session"');
    expect(routes).toContain("createPublicXAILiveDemoSession");
    expect(routes).toContain("publicXAIDemoConfigured");
    expect(routes).not.toContain('fetch("https://api.vapi.ai/call/web"');
    expect(hook).toContain('fetch("/api/public/demo-session"');
    expect(hook).toContain("new WebSocket(session.websocketUrl");
    expect(widget).toContain("useProtectedPublicDemo");
    expect(widget).not.toContain("VITE_VAPI_PUBLIC_KEY");
    expect(widget).not.toContain("/api/public/assistant/");
  });

  it("keeps the compatibility route metadata-only", () => {
    const compatibilityStart = routes.indexOf('router.get("/api/public/assistant/:agentName"');
    const compatibilityEnd = routes.indexOf("Cheap availability preflight", compatibilityStart);
    const compatibilityBlock = routes.slice(compatibilityStart, compatibilityEnd);
    expect(compatibilityBlock).toContain('mode: "protected_native_browser_preview"');
    expect(compatibilityBlock).toContain('sessionEndpoint: "/api/public/demo-session"');
    expect(compatibilityBlock).not.toContain("buildPublicBrowserAssistant(agent)");
    expect(compatibilityBlock).not.toContain("systemPrompt");
    expect(compatibilityBlock).not.toContain("voiceId");
    expect(compatibilityBlock).not.toContain("transcriber");
  });

  it("checks the real protected-demo runtime before asking for microphone access", () => {
    const sessionRequest = hook.indexOf('fetch("/api/public/demo-session"');
    const permissionRequest = hook.indexOf("navigator.mediaDevices.getUserMedia");
    const sessionRouteStart = routes.indexOf('"/api/public/demo-session"');
    const sessionRouteEnd = routes.indexOf('"/api/public/demo-xai-session"', sessionRouteStart);
    const sessionRoute = routes.slice(sessionRouteStart, sessionRouteEnd);
    const providerReadiness = sessionRoute.indexOf(
      "!publicDemoTicketingReady() || !publicXAIDemoConfigured()",
    );
    const ticketIssue = sessionRoute.indexOf("issuePublicDemoTicket({");

    expect(sessionRequest).toBeGreaterThan(-1);
    expect(permissionRequest).toBeGreaterThan(sessionRequest);
    expect(providerReadiness).toBeGreaterThan(-1);
    expect(ticketIssue).toBeGreaterThan(providerReadiness);
  });

  it("fences canceled and stalled starts before they can reclaim provider ownership", () => {
    expect(hook).toContain("PUBLIC_DEMO_SESSION_REQUEST_TIMEOUT_MS = 15_000");
    expect(hook).toContain("PUBLIC_DEMO_CONNECTION_TIMEOUT_MS = 20_000");
    expect(hook).toContain("const attemptRef = useRef(0)");
    expect(hook).toContain("const sessionAbortRef = useRef<AbortController | null>(null)");
    expect(hook).toContain("signal: controller.signal");
    expect(hook).toContain("if (attempt !== attemptRef.current) return");
    expect(hook).toContain("attemptRef.current += 1");
    expect(hook).toContain("The live connection took too long");
    expect(hook).toContain("socket.current?.close(1000, \"Wireline protected demo ended\")");
    expect(hook, "provider exceptions must not be dumped raw").not.toContain(
      "voice bridge error:",
    );
    expect(hook, "provider exceptions must not be dumped raw").not.toContain(
      "call start failed:",
    );
  });

  it("keeps cancellation reachable while a private session is connecting", () => {
    expect(widget).toContain('? "Cancel"');
    expect(widget).toContain("disabled={demo.completed}");
    expect(widget).toContain("demo.callActive || demo.connecting");
    expect(widget).toContain("Cancel at any time before the private call session begins.");
    expect(widget).not.toContain("disabled={demo.connecting || demo.completed}");
  });

  it("uses Express's trusted proxy identity instead of caller-controlled forwarding input", () => {
    const requestIpStart = routes.indexOf("function requestIp(req: Request)");
    const requestIpEnd = routes.indexOf("function requestHost", requestIpStart);
    const requestIpBlock = routes.slice(requestIpStart, requestIpEnd);

    expect(server).toContain('if (IS_PROD) app.set("trust proxy", 1);');
    expect(requestIpBlock).toContain('return String(req.ip || "unknown").trim();');
    expect(requestIpBlock).not.toContain("x-forwarded-for");
    expect(routes).toContain("admitPublicDemoTicketMint(fingerprint)");
    expect(routes).toContain("admitPublicWebDemoSession(verification.claims.ip)");
  });

  it("caps duration, disables retained artifacts, and exposes no real tools", () => {
    const policy = read("src/lib/public-browser-demo.ts");
    const demoSession = read("src/lib/voice/xai-public-demo-session.ts");
    expect(policy).toContain("PUBLIC_BROWSER_DEMO_MAX_SECONDS = 45");
    expect(routes).toContain("maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS");
    expect(demoSession).toContain("tools: []");
    expect(demoSession).toContain('tool_choice: "none"');
    expect(policy).toContain("recordingEnabled: false");
    expect(policy).toContain("videoRecordingEnabled: false");
    expect(policy).toContain("pcapEnabled: false");
    expect(policy).toContain("loggingEnabled: false");
    expect(policy).toContain("transcriptPlan: { enabled: false }");
    expect(demoSession).not.toContain("create_followup_task");
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

  it("keeps compact home proof and the protected live demo on Showcase", () => {
    expect(landing).toContain('to="/showcase"');
    expect(landing).toContain("<BotMark");
    expect(landing).not.toContain("<BrowserCallWidget");
    expect(showcase).toContain("<BrowserCallWidget");
    expect(showcase).toContain('id="demo-lines"');
    expect(showcase).toContain("CALL A DEMO LINE");
    expect(showcase).toContain('href={`tel:${agent.tel}`}');
    expect(hook).toContain("Try the public demo line instead");
    expect(widget).toContain("Public demo line available");
    expect(widget).toContain("Standard carrier rates may apply");
    expect(widget).toContain("No retained call artifacts");
  });
});
