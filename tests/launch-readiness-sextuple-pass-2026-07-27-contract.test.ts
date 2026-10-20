import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness cross-surface contract", () => {
  it("pins Runtime Balance billing continuity and canonical Stripe catalog checks", () => {
    const grace = read("src/lib/voice-completion-grace.ts");
    const script = [
      read("scripts/generate-launch-status.mjs"),
      read("scripts/lib/stripe-launch-readiness.mjs"),
    ].join("\n");
    expect(grace).toContain("temporary negative Runtime Balance");
    expect(script).toContain("FOUNDER_CATALOG_VERSION");
    expect(script).toContain("PUBLIC_SELF_SERVE_PLAN_IDS");
    expect(script).toContain("stripe_public_catalog_not_aligned");
    expect(script).toContain('subscription_cancel?.mode === "at_period_end"');
  });

  it("keeps Knowledge upload honesty and public compliance copy", () => {
    const kb = read("src/components/KnowledgeBaseClaude.tsx");
    const security = read("src/components/Security.tsx");
    expect(kb).toContain("config?.capabilities?.image_uploads === true");
    expect(kb).toMatch(
      /accept=\{\s*imageUploadsAvailable\s*\?\s*"\.txt,\.csv,\.md,\.markdown,\.pdf,\.docx,\.xlsx,image\/png,image\/jpeg,image\/jpg,image\/webp,image\/gif"\s*:\s*"\.txt,\.csv,\.md,\.markdown,\.pdf,\.docx,\.xlsx"/,
    );
    expect(kb).toContain(
      "Image uploads are unavailable. Upload TXT, MD, CSV, PDF, DOCX, or XLSX files.",
    );
    expect(kb).toContain("document type that does not match its extension");
    expect(security).toMatch(
      /Recipient permission and account Do Not Call checks remain enforced before eligible outgoing calls are placed\./i,
    );
    expect(security).not.toContain("Live outbound dialing is gated");
    expect(security).not.toContain("FEDERAL_DNC_API_KEY");
  });

  it("keeps public launch voice and customer errors owned by BotBound", () => {
    const blog = read("src/pages/Blog.tsx");
    const pricing = read("src/pages/Pricing.tsx");
    const aiErrors = read("src/lib/ai-stream-errors.ts");
    expect(blog).toContain("Practical guides for Bots");
    expect(blog).toContain("Tell your Bot");
    expect(blog).not.toContain("Wireline");
    expect(pricing).toMatch(/Bot/i);
    expect(pricing).not.toContain("AI conversation workforce");
    expect(aiErrors).toContain("BotBound AI is temporarily unavailable. Try again shortly.");
    expect(aiErrors).not.toContain("Configure a reachable AI provider");
  });

  it("keeps transport fallbacks and executable marketing surfaces free of retired hero mandates", () => {
    const contact = read("src/components/ContactPage.tsx");
    const support = read("src/components/SupportPage.tsx");
    const css = read("src/styles/public-marketing-polish.css");
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    for (const source of [contact, support]) {
      expect(source).toContain("responseStatus !== null && responseStatus >= 500");
      expect(source).toContain("mailto:support@botbound.app");
      expect(source).not.toContain("support@trywireline.com");
    }
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(cssWithoutComments).not.toMatch(/AI VOICE AGENTS/i);
    expect(landing).not.toContain("AI VOICE AGENTS");
  });
});
