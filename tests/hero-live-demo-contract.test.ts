import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("homepage live demo contract", () => {
  it("keeps the hero on the canonical voice-first Bot product truth", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const botProduct = read("src/lib/bot-product.ts");

    expect(landing).toContain("BOT_MARKETING_VOICE as MARKETING_VOICE");
    expect(landing).toContain("MARKETING_VOICE.headline");
    expect(landing).toContain("MARKETING_VOICE.subline");
    expect(landing).toContain('aria-label="Bot channels"');
    expect(landing).toContain("CORE_CHANNELS.map");
    expect(botProduct).toContain('slogan: "BOTS THAT GET THE WORK DONE"');
    expect(botProduct).toContain(
      'supportingLine: "VOICE-FIRST BOTS FOR CALLS, LIVE CONVERSATIONS, TEXT, AND EMAIL"',
    );
  });

  it("keeps a real protected browser demo and an honest phone fallback", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const widget = read("src/components/marketing/BrowserCallWidget.tsx");

    expect(landing).toContain("<BrowserCallWidget");
    expect(landing).toContain('id="hear-a-demo"');
    expect(widget).toContain("useProtectedPublicDemo");
    expect(landing).toContain('aria-label="Call the Public Demo Bot"');
    expect(landing).toContain("Call Demo Bot");
    expect(landing).toContain("HERO_DEMO_AGENT.tel");
    expect(landing).toContain('mode: "phone"');
    expect(widget).toContain("Demo Voice Bot");
    expect(widget).toContain("Bot speaking");
    expect(widget).not.toContain("Demo Voice Agent");
    expect(widget).not.toContain("Agent speaking");
  });

  it("keeps demo sessions bounded, measured, and Bot-branded", () => {
    const demo = read("src/hooks/useProtectedPublicDemo.ts");
    const provider = read("src/lib/voice/xai-public-demo-session.ts");

    expect(demo).toContain('fetch("/api/public/demo-session"');
    expect(demo).toContain("PUBLIC_BROWSER_DEMO_MAX_SECONDS");
    expect(demo).toContain("PUBLIC_DEMO_SESSION_REQUEST_TIMEOUT_MS");
    expect(demo).toContain("PUBLIC_DEMO_CONNECTION_TIMEOUT_MS");
    expect(demo).toContain('event: "landing_demo_clicked"');
    expect(demo).toContain('surface: "marketing_web"');
    expect(demo).toContain("endTimerRef.current");
    expect(provider).toContain("Wireline Voice Bot");
    expect(provider).not.toMatch(/Wireline voice agent/i);
  });

  it("does not present illustrative workflow events as live telemetry", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain('aria-label="Illustrative completed workflow"');
    expect(landing).toContain("Illustrative Workflow");
  });
});
