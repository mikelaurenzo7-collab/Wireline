import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public live demo contract", () => {
  it("keeps the homepage on the canonical BotBound product truth", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const botProduct = read("src/lib/bot-product.ts");

    expect(landing).toContain("PUT YOUR BOT");
    expect(landing).toContain("ON THE LINE");
    expect(landing).toContain("BOT_MARKETING_VOICE.subline");
    expect(landing).toContain('aria-label="BotBound channels"');
    expect(landing).toContain("HERO_CHANNELS.map");
    expect(botProduct).toContain('slogan: "PUT YOUR BOT ON THE LINE"');
    expect(botProduct).toContain('supportingLine: "CALL · TEXT · EMAIL"');
  });

  it("keeps a real protected browser demo and an honest phone fallback on Showcase", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const showcase = read("src/pages/Showcase.tsx");
    const widget = read("src/components/marketing/BrowserCallWidget.tsx");

    expect(landing).toContain('to="/showcase"');
    expect(landing).toContain("<BotMark");
    expect(landing).not.toContain("<BrowserCallWidget");
    expect(showcase).toContain("<BrowserCallWidget");
    expect(showcase).toContain('id="demo-lines"');
    expect(showcase).toContain("CALL A DEMO LINE");
    expect(showcase).toContain('href={`tel:${agent.tel}`}');
    expect(widget).toContain("useProtectedPublicDemo");
    expect(widget).toContain("Demo Phone Bot");
    expect(widget).toContain("Bot speaking");
    expect(widget).not.toContain("Demo Voice Agent");
    expect(widget).not.toContain("Agent speaking");
  });

  it("keeps demo sessions bounded, measured, and BotBound-branded", () => {
    const demo = read("src/hooks/useProtectedPublicDemo.ts");
    const provider = read("src/lib/voice/openai-public-demo-session.ts");

    expect(demo).toContain('fetch("/api/public/demo-session"');
    expect(demo).toContain("PUBLIC_BROWSER_DEMO_MAX_SECONDS");
    expect(demo).toContain("PUBLIC_DEMO_SESSION_REQUEST_TIMEOUT_MS");
    expect(demo).toContain("PUBLIC_DEMO_CONNECTION_TIMEOUT_MS");
    expect(demo).toContain('event: "landing_demo_clicked"');
    expect(demo).toContain('surface: "marketing_web"');
    expect(demo).toContain("endTimerRef.current");
    expect(provider).toContain("BotBound Voice Bot");
    expect(provider).not.toMatch(/Wireline voice agent/i);
  });

  it("does not present fabricated workflow telemetry on the homepage", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).not.toContain("Illustrative Workflow");
    expect(landing).not.toContain("Booked and logged");
    expect(landing).not.toContain("landing-console__events");
  });
});
