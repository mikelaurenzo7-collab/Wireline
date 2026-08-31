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
    expect(landing).toContain("BOT_MARKETING_VOICE.activationLine");
    expect(landing).not.toContain('aria-label="BotBound channels"');
    expect(landing).not.toContain("HERO_CHANNELS.map");
    expect(botProduct).toContain('slogan: "PUT YOUR BOT ON THE LINE"');
    expect(botProduct).toContain('supportingLine: "CALL · TEXT · EMAIL"');
    expect(botProduct).toContain(
      'activationLine: "Start free. Every live Bot gets its own number and email."',
    );
  });

  it("keeps a real protected browser demo and a truthful product fallback on Showcase", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const showcase = read("src/pages/Showcase.tsx");
    const widget = read("src/components/marketing/BrowserCallWidget.tsx");

    expect(landing).toContain("<BrowserCallWidget");
    expect(landing).toContain('variant="inline"');
    expect(landing).toContain("buttonLabel={`Talk to ${HERO_DEMO.name}`}");
    expect(landing).toContain('to="/showcase"');
    expect(landing).toContain("Open browser demo");
    expect(landing).not.toContain("<BotMark");
    expect(showcase).toContain("<BrowserCallWidget");
    expect(showcase).toContain('id="showcase-preview"');
    expect(showcase).toContain("BUILD YOUR BOT");
    expect(showcase).toContain("Protected browser preview");
    expect(showcase).toContain('role="group"');
    expect(showcase).toContain("aria-pressed={selected}");
    expect(showcase).not.toContain('role="tablist"');
    expect(showcase).not.toContain('id="demo-lines"');
    expect(showcase).not.toContain("href={`tel:${agent.tel}`}");
    expect(widget).toContain("useProtectedPublicDemo");
    expect(widget).toContain("Demo Phone Bot");
    expect(widget).not.toContain("LIVE PHONE BOT");
    expect(widget).toContain("Headphones");
    expect(widget).not.toContain("markKey");
    expect(widget).not.toContain("<BotMark");
    expect(widget).toContain("Bot speaking");
    expect(widget).not.toContain("Demo Voice Agent");
    expect(widget).not.toContain("Agent speaking");
    expect(widget).not.toContain("Public demo line available");
    expect(widget).not.toContain("Standard carrier rates may apply");
  });

  it("does not advertise retired founder phone numbers on public marketing CTAs", () => {
    const surfaces = [
      "src/pages/Showcase.tsx",
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
    expect(provider).toContain("demonstrating BotBound");
    expect(provider).toContain("Hi, I’m ${input.agent.name}.");
    expect(provider).not.toContain("BotBound Phone Bot");
    expect(provider).not.toMatch(/Wireline voice agent/i);
  });

  it("does not present fabricated workflow telemetry on the homepage", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).not.toContain("Illustrative Workflow");
    expect(landing).not.toContain("Booked and logged");
    expect(landing).not.toContain("landing-console__events");
  });
});
