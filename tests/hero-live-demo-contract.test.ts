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
    expect(botProduct).toContain('supportingLine: "VOICE-FIRST BOTS FOR CALLS, LIVE CONVERSATIONS, TEXT, AND EMAIL"');
  });

  it("keeps a real browser demo path and an honest phone fallback", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(landing).toContain("BrowserCallWidget");
    expect(landing).toContain('id="hear-a-demo"');
    expect(landing).toContain('aria-label="Call the Public Demo Bot"');
    expect(landing).toContain("Call Demo Bot");
    expect(landing).toContain("HERO_DEMO_AGENT.tel");
    expect(landing).toContain('mode: "phone"');
  });

  it("measures demo intent without pretending illustrative workflow events are live telemetry", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(landing).toContain('event: "landing_demo_clicked"');
    expect(landing).toContain('surface: "marketing_web"');
    expect(landing).toContain('aria-label="Illustrative completed workflow"');
    expect(landing).toContain("Illustrative Workflow");
  });
});
