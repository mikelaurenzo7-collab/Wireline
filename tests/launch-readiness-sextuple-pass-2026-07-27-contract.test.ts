import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness cross-surface contract", () => {
  it("pins Runtime Balance billing continuity and canonical Stripe catalog checks", () => {
    const grace = read("src/lib/voice-completion-grace.ts");
    const script = read("scripts/generate-launch-status.mjs");
    expect(grace).toContain("temporary negative Runtime Balance");
    expect(script).toContain("FOUNDER_CATALOG_VERSION");
    expect(script).toContain("PUBLIC_SELF_SERVE_PLAN_IDS");
    expect(script).toContain("stripe_public_catalog_not_aligned");
    expect(script).toContain('subscription_cancel?.mode === "at_period_end"');
  });

  it("keeps Knowledge upload honesty and public compliance copy", () => {
    const kb = read("src/components/KnowledgeBaseClaude.tsx");
    const security = read("src/components/Security.tsx");
    expect(kb).toContain('accept=".txt,.csv,.md,.markdown,image/png,image/jpeg,image/jpg,image/webp,image/gif"');
    expect(kb).toContain("is not supported yet");
    expect(security).toMatch(/Marketing and campaign outbound[^.]*fail closed[^.]*stay blocked[^.]*federal DNC setup/i);
    expect(security).not.toContain("FEDERAL_DNC_API_KEY");
  });

  it("keeps public launch voice on Bots and provider errors truthful", () => {
    const blog = read("src/pages/Blog.tsx");
    const pricing = read("src/pages/Pricing.tsx");
    const aiErrors = read("src/lib/ai-stream-errors.ts");
    expect(blog).toContain("Voice Bots");
    expect(pricing).toMatch(/Bot/i);
    expect(pricing).not.toContain("AI conversation workforce");
    expect(aiErrors).toContain("OpenAI, Gemini, or AI Gateway");
  });

  it("keeps transport fallbacks and current marketing CSS free of retired hero mandates", () => {
    const contact = read("src/components/ContactPage.tsx");
    const support = read("src/components/SupportPage.tsx");
    const css = read("src/styles/public-marketing-polish.css");
    for (const source of [contact, support]) {
      expect(source).toContain("responseStatus !== null && responseStatus >= 500");
      expect(source).toContain("mailto:support@trywireline.com");
    }
    expect(css).not.toMatch(/keep ["']AI VOICE AGENTS["']/i);
  });
});
