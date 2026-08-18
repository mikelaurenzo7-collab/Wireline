import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("homepage live demo contract", () => {
  it("keeps the hero on the voice-first Bot product truth", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const botProduct = read("src/lib/bot-product.ts");

    expect(landing).toContain("BOT_BRAND_IDENTITY.slogan");
    expect(landing).toContain("BOT_BRAND_IDENTITY.supportingLine");
    expect(landing).toContain('aria-label="Bot channels"');
    expect(landing).toContain("CORE_CHANNELS.map");
    expect(botProduct).toContain('slogan: "BOTS THAT GET THE WORK DONE"');
    expect(botProduct).toContain(
      'supportingLine: "VOICE-FIRST BOTS FOR CALLS, LIVE CONVERSATIONS, TEXT, AND EMAIL"',
    );
  });

  it("keeps a real live demo path and an honest fallback", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(landing).toContain("LiveConversationDemo");
    expect(landing).toContain("FallbackDemoCard");
    expect(landing).toContain('aria-label="Call the Public Demo Bot"');
    expect(landing).toContain("Call the Demo");
    expect(landing).toContain("PUBLIC_DEMO_NUMBER");
    expect(landing).toContain("window.location.assign(PUBLIC_DEMO_TEL)");
  });

  it("keeps demo sessions bounded and measured", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(landing).toContain("createPublicDemoSession");
    expect(landing).toContain("stopPublicDemo");
    expect(landing).toContain("PUBLIC_DEMO_MAX_MS");
    expect(landing).toContain('event: "marketing_demo_started"');
    expect(landing).toContain('event: "marketing_demo_completed"');
    expect(landing).toContain('event: "marketing_demo_failed"');
  });
});
