import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("vendor live-research and voice posture", () => {
  it("keeps PSTN live research on Perplexity→Gemini without inventing extra search vendors", () => {
    const research = read("src/lib/fresh-public-research.ts");
    const perplexity = read("src/lib/perplexity-platform.ts");
    const flags = read("src/lib/platform-integration-flags.ts");
    const tools = read("src/lib/vapi-helpers.ts");

    expect(perplexity).toContain("PERPLEXITY_API_KEY");
    expect(perplexity).toContain("PERPLEXITY_SEARCH_API_URL");
    expect(perplexity).toContain("PERPLEXITY_AGENT_API_URL");
    expect(perplexity).toContain("PERPLEXITY_EMBEDDINGS_API_URL");
    expect(perplexity).toContain('route: "sonar"');
    expect(research).toContain("perplexity_agent");
    expect(research).toContain("researchPerplexity");
    expect(research).not.toMatch(/tavily|serper|bing/i);
    expect(flags).toContain("liveResearch: gemini || perplexity");
    expect(tools).toContain("gemini_ground");
    expect(tools).toMatch(/Perplexity when configured/i);
  });

  it("keeps production Perplexity credentials inert on previews unless a dedicated preview key exists", () => {
    const boundary = read("scripts/check-deployment-boundaries.mjs");
    const perplexity = read("src/lib/perplexity-platform.ts");

    expect(boundary).toContain("reviewedPreviewCredentialKeys");
    expect(boundary).toContain('"PERPLEXITY_API_KEY"');
    expect(boundary).toContain('"PERPLEXITY_PREVIEW_API_KEY"');
    expect(perplexity).toContain('process.env.VERCEL_ENV === "preview"');
    expect(perplexity).toContain("PERPLEXITY_PREVIEW_API_KEY");
  });

  it("keeps live web research under the agent capability toggle", () => {
    const capabilities = read("src/lib/agent-capabilities.ts");
    const actionEngine = read("src/components/AgentActionEngine.tsx");
    const vapiTools = read("src/lib/vapi-helpers.ts");

    expect(capabilities).toContain('name: "gemini_ground"');
    expect(capabilities).toContain('label: "Grounded web search"');
    expect(actionEngine).toContain("enabledTools.includes(tool.name)");
    expect(actionEngine).toContain("body: JSON.stringify({ enabledTools })");
    expect(vapiTools).toContain("resolveAgentTools(role, enabledTools)");
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
