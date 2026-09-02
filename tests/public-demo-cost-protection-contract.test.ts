import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("retired public browser voice cost boundary", () => {
  const routes = read("src/routes/marketing-runtime-routes.ts");
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
  const showcase = read("src/pages/Showcase.tsx");

  it("serves only deterministic 410 responses from the legacy voice-preview endpoints", () => {
    expect(routes).toContain("function publicVoicePreviewRetired");
    expect(routes).toContain('res.setHeader("Cache-Control", "no-store")');
    expect(routes).toContain("res.status(410).json");
    expect(routes).toContain('code: "public_voice_preview_retired"');
    expect(routes).toContain('signupPath: "/signup?plan=free"');
    expect(routes.match(/publicVoicePreviewRetired\);/g)).toHaveLength(3);
  });

  it("cannot create paid provider work from an unauthenticated marketing route", () => {
    expect(routes).not.toMatch(
      /OpenAI|createPublicOpenAILiveDemoCall|createServerManagedOpenAIRealtimeCall|issuePublicDemoTicket|consumePublicDemoTicket|RTCPeerConnection|getUserMedia/,
    );
    expect(routes).not.toMatch(/api\.openai\.com|api\.vapi\.ai|api\.x\.ai/);
  });

  it("keeps public pages free of microphone and public-audio activation paths", () => {
    expect(landing).not.toMatch(
      /BrowserCallWidget|useProtectedPublicDemo|RTCPeerConnection|getUserMedia/,
    );
    expect(showcase).toContain("<Navigate to={FREE_SIGNUP} replace />");
    expect(showcase).not.toMatch(
      /BrowserCallWidget|useProtectedPublicDemo|RTCPeerConnection|getUserMedia/,
    );
  });

  it("removes obsolete public-demo budget and ticket machinery", () => {
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

  it("retains account-bound voice simulation with authenticated server admission", () => {
    const sandbox = read("src/components/OpenAILiveVoiceSandbox.tsx");
    const liveRoutes = read("src/routes/live-voice-routes.ts");
    expect(sandbox).toContain('authFetch("/api/voice/live/session"');
    expect(sandbox).toContain("new RTCPeerConnection()");
    expect(liveRoutes).toMatch(
      /router\.post\(\s*"\/api\/voice\/live\/session",\s*authenticateUser/,
    );
  });
});
