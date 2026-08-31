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
    expect(routes).toContain('"/api/public/demo-call"');
    expect(routes).toContain("createPublicOpenAILiveDemoCall");
    expect(routes).toContain("publicOpenAIDemoConfigured");
    expect(routes).not.toContain('fetch("https://api.vapi.ai/call/web"');
    expect(hook).toContain('fetch("/api/public/demo-session"');
    expect(hook).toContain("new RTCPeerConnection()");
    expect(hook).toContain("connection.setRemoteDescription");
    expect(hook).not.toContain("new WebSocket(");
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
    const sessionRouteEnd = routes.indexOf('"/api/public/demo-call"', sessionRouteStart);
    const sessionRoute = routes.slice(sessionRouteStart, sessionRouteEnd);
    const providerReadiness = sessionRoute.indexOf(
      "!publicDemoTicketingReady() || !publicOpenAIDemoConfigured()",
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
    expect(hook).toContain("PUBLIC_DEMO_PROVIDER_SESSION_REQUEST_TIMEOUT_MS = 40_000");
    expect(hook).toContain("const attemptRef = useRef(0)");
    expect(hook).toContain("const sessionAbortRef = useRef<AbortController | null>(null)");
    expect(hook).toContain("signal: controller.signal");
    expect(hook).toContain("if (attempt !== attemptRef.current) return");
    expect(hook).toContain("attemptRef.current += 1");
    expect(hook).toContain("The live connection took too long");
    expect(hook).toContain("activePeer?.close()");
    expect(hook).toContain("microphone.current?.getTracks().forEach((track) => track.stop())");
    expect(hook, "provider exceptions must not be dumped raw").not.toContain("voice bridge error:");
    expect(hook, "provider exceptions must not be dumped raw").not.toContain("call start failed:");
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
    const demoSession = read("src/lib/voice/openai-public-demo-session.ts");
    expect(policy).toContain("PUBLIC_BROWSER_DEMO_MAX_SECONDS = 45");
    expect(routes).toContain("maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS");
    expect(demoSession).toContain("tools: []");
    expect(demoSession).toContain('tool_choice: "none"');
    expect(demoSession).toContain("createServerManagedOpenAIRealtimeCall");
    expect(demoSession).toContain("hangupOpenAIRealtimeCall");
    expect(hook).not.toContain("api.openai.com");
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

  it("keeps a protected browser demo on the home entrance and a product fallback on Showcase", () => {
    expect(landing).toContain("<BrowserCallWidget");
    expect(landing).toContain('variant="inline"');
    expect(landing).not.toContain("markKey");
    expect(widget).not.toContain("<BotMark");
    expect(showcase).toContain("<BrowserCallWidget");
    expect(showcase).toContain('id="showcase-preview"');
    expect(showcase).toContain("BUILD YOUR BOT");
    expect(showcase).not.toContain('id="demo-lines"');
    expect(showcase).not.toContain("CALL A DEMO LINE");
    expect(showcase).not.toContain("href={`tel:${agent.tel}`}");
    expect(hook).toContain("Try again, or build your own Bot.");
    expect(widget).toContain("Continue in product");
    expect(widget).not.toContain("Public demo line available");
    expect(widget).not.toContain("Standard carrier rates may apply");
    expect(widget).toContain("Private ${demo.maxDurationSeconds}-second browser call.");
  });
});
