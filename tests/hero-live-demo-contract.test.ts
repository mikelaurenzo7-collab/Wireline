import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public voice-preview retirement contract", () => {
  it("keeps the homepage on the canonical BotBound product truth", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const botProduct = read("src/lib/bot-product.ts");

    expect(landing).toContain("Voice Calls. Texts. Email. Computer Use.");
    expect(landing).not.toContain("landing-prestige__promise");
    expect(landing).not.toMatch(/BrowserCallWidget|useProtectedPublicDemo|\/api\/public\/demo-/);
    expect(botProduct).toContain('slogan: "Your next hire is a bot."');
    expect(botProduct).toContain('supportingLine: "CALL · TEXT · EMAIL · COMPUTER"');
    expect(botProduct).not.toContain("activationLine:");
  });

  it("redirects the retired Showcase directly to plan-neutral signup", () => {
    const app = read("src/App.tsx");

    expect(existsSync(resolve(process.cwd(), "src/pages/Showcase.tsx"))).toBe(false);
    expect(app).toContain('<Route path="/showcase" element={<PreservingRedirect to="/signup" />} />');
    expect(app).toContain("return <Navigate to={`${to}${location.search}${location.hash}`} replace />");
    expect(app).not.toMatch(/path="\/showcase"[\s\S]{0,80}plan=/);
  });

  it("keeps official captures on live product surfaces instead of screenshotting the redirect", () => {
    const officialAssets = read("scripts/build-official-assets.mjs");
    const visualQa = read("scripts/capture-visual-qa.mjs");

    expect(officialAssets).toContain('path.join(web, "features-1920x1080.png")');
    expect(officialAssets).toContain('{ id: "07-features", route: "/features" }');
    expect(officialAssets).not.toContain('captureSized(page, "/showcase"');
    expect(visualQa).toContain("PRODUCTION_VISUAL_MARKETING_ROUTES");
    expect(visualQa).not.toMatch(/const marketingRoutes = \[[\s\S]*"\/showcase"/);
  });

  it("returns provider-free 410 responses from every legacy public voice endpoint", () => {
    const routes = read("src/routes/marketing-runtime-routes.ts");

    expect(routes).toContain("function publicVoicePreviewRetired");
    expect(routes).toContain("res.status(410).json");
    expect(routes).toContain('code: "public_voice_preview_retired"');
    expect(routes).toContain('signupPath: "/signup?plan=free"');
    expect(routes).toContain(
      'router.get("/api/public/assistant/:agentName", publicVoicePreviewRetired)',
    );
    expect(routes).toContain('router.post("/api/public/demo-session", publicVoicePreviewRetired)');
    expect(routes).toContain('router.post("/api/public/demo-call", publicVoicePreviewRetired)');
    expect(routes).not.toMatch(
      /createPublicOpenAILiveDemoCall|createServerManagedOpenAIRealtimeCall|api\.openai\.com|api\.vapi\.ai/,
    );
  });

  it("keeps voice simulation inside the authenticated product", () => {
    const sandbox = read("src/components/OpenAILiveVoiceSandbox.tsx");
    const routes = read("src/routes/live-voice-routes.ts");

    expect(sandbox).toContain('authFetch("/api/voice/live/session"');
    expect(sandbox).toContain("new RTCPeerConnection()");
    expect(sandbox).toContain("navigator.mediaDevices.getUserMedia");
    expect(sandbox).toContain("microphone.current?.getTracks().forEach((track) => track.stop())");
    expect(routes).toMatch(/router\.post\(\s*"\/api\/voice\/live\/session",\s*authenticateUser/);
  });

  it("removes the retired public browser runtime instead of leaving dormant provider code", () => {
    for (const path of [
      "src/components/marketing/BrowserCallWidget.tsx",
      "src/hooks/useProtectedPublicDemo.ts",
      "src/lib/public-browser-demo.ts",
      "src/lib/public-demo-budget.ts",
      "src/lib/public-demo-ticket.ts",
      "src/lib/voice/openai-public-demo-session.ts",
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false);
    }
  });

  it("does not advertise retired founder phone numbers on public marketing CTAs", () => {
    const surfaces = [
      "src/pages/SolutionsPage.tsx",
      "src/pages/VerticalLanding.tsx",
      "src/data/vertical-wedges.ts",
      "src/components/ContactPage.tsx",
      "src/components/SupportPage.tsx",
      "src/components/layout/NotFound.tsx",
      "src/components/marketing/WireAgentLanding.tsx",
    ].map((path) => read(path));

    for (const source of surfaces) {
      expect(source).not.toMatch(/href=\{`tel:|href: "tel:|href={`tel:/);
    }
  });

  it("does not present fabricated workflow telemetry on the homepage", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).not.toContain("Illustrative Workflow");
    expect(landing).not.toContain("Booked and logged");
    expect(landing).not.toContain("landing-console__events");
  });
});
