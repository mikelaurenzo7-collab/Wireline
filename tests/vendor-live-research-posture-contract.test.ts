import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("vendor live-research and voice posture", () => {
  it("keeps PSTN live research on Perplexity→Gemini without inventing Tavily/Serper", () => {
    const research = read("src/lib/fresh-public-research.ts");
    const flags = read("src/lib/platform-integration-flags.ts");
    const tools = read("src/lib/vapi-helpers.ts");

    expect(research).toContain("PERPLEXITY_API_KEY");
    expect(research).toContain("groundedSearch");
    expect(research).not.toMatch(/tavily|serper|bing/i);
    expect(flags).toContain("liveResearch: gemini || perplexity");
    expect(tools).toContain("gemini_ground");
    expect(tools).toMatch(/Perplexity when configured/i);
  });

  it("does not claim Grok voice sessions have open-web search tools", () => {
    const features = read("src/lib/grok-features.ts");
    const voiceTools = read("src/lib/voice/grok-voice-config.ts");

    expect(features).toContain("approved Training knowledge");
    expect(features).not.toMatch(/live web and social/i);
    expect(voiceTools).toContain("search_agent_knowledge");
    expect(voiceTools).not.toMatch(/gemini_ground|perplexity|web_search/i);
  });

  it("keeps ElevenLabs off the tenant PSTN assistant path", () => {
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    expect(factory).not.toMatch(/provider:\s*["']11labs["']/);
    expect(factory).toMatch(/voice|deepgram/i);
  });
});
