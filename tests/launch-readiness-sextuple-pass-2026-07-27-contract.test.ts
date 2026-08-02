import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness sextuple-pass 2026-07-27", () => {
  it("pins Runtime Balance in billing continuity grace copy", () => {
    const grace = read("src/lib/voice-completion-grace.ts");
    const continuity = read("tests/live-call-billing-continuity-contract.test.ts");
    expect(grace).toContain("temporary negative Runtime Balance");
    expect(continuity).toContain("temporary negative Runtime Balance");
    expect(continuity).not.toContain("temporary negative Conversation Balance");
  });

  it("gates launch-status Starter annual at catalog v6 $190", () => {
    const script = read("scripts/generate-launch-status.mjs");
    expect(script).toContain("unit_amount_usd !== 190");
    expect(script).toContain("starter_annual_price_not_live_190");
    expect(script).not.toContain("starter_annual_price_not_live_99");
  });

  it("keeps Knowledge upload honesty aligned with the text/image asset API", () => {
    const kb = read("src/components/KnowledgeBaseClaude.tsx");
    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("Upload a text document or a PNG, JPG, WEBP, or GIF image.");
    expect(kb).toContain(
      'accept=".txt,.csv,.md,.markdown,image/png,image/jpeg,image/jpg,image/webp,image/gif"',
    );
    expect(kb).toContain("TXT, MD, CSV, or images (PNG, JPG, WEBP, GIF)");
    expect(kb).not.toContain("PDF, DOCX, TXT, CSV");
    expect(kb).toContain("is not supported yet");
    expect(kb).toContain("Knowledge could not be loaded.");
  });

  it("never marks ComplianceChecklist integrations done on a failed health fetch", () => {
    const checklist = read("src/components/admin/ComplianceChecklist.tsx");
    expect(checklist).toContain("intRes != null &&");
    expect(checklist).toContain("dncRes != null && dncLen > 0");
  });

  it("keeps public Trust and tenant Compliance free of vendor/env operator copy", () => {
    const security = read("src/components/Security.tsx");
    const compliance = read("src/components/ComplianceCenter.tsx");
    expect(security).toMatch(
      /Marketing and campaign outbound[^.]*fail closed[^.]*stay blocked[^.]*federal DNC setup/i,
    );
    expect(security).not.toContain("DNCScrub");
    expect(security).not.toContain("FEDERAL_DNC_API_KEY");
    expect(compliance).toContain("Marketing outbound blocked");
    expect(compliance).not.toContain("DNCScrub");
  });

  it("aligns Blog, Pricing, Messaging playbook, and AI error copy with launch voice", () => {
    const blog = read("src/pages/Blog.tsx");
    const pricing = read("src/pages/Pricing.tsx");
    const playbooks = read("src/lib/integration-playbooks.ts");
    const aiErrors = read("src/lib/ai-stream-errors.ts");
    const browser = read("src/pages/BrowserCommandInstallPage.tsx");
    expect(blog).toContain("Voice agent");
    expect(blog).not.toContain("AI call agent");
    expect(pricing).toContain("Full phone coverage for growing teams.");
    expect(pricing).not.toContain("AI conversation workforce");
    expect(playbooks).toContain("WhatsApp in private beta");
    expect(aiErrors).toContain("OpenAI, Gemini, or AI Gateway");
    expect(aiErrors).not.toContain("xAI, OpenAI");
    expect(browser).not.toContain("dogfood");
  });

  it("surfaces Contact/Support API errors inline instead of always opening mailto", () => {
    const contact = read("src/components/ContactPage.tsx");
    const support = read("src/components/SupportPage.tsx");
    expect(contact).toContain("Only fall back to mailto for transport failures");
    expect(contact).toContain("setError(message)");
    expect(support).toContain("setError(message)");
    expect(support).toContain("isTransport");
  });

  it("retunes home hero CSS for AI VOICE AGENTS and surfaces team fetch failures", () => {
    const css = read("src/styles/public-marketing-polish.css");
    const admin = read("src/components/AdminSettings.tsx");
    expect(css).toContain('keep "AI VOICE AGENTS"');
    expect(css).toContain("max-width: min(100%, 16ch)");
    expect(admin).toContain('toastError("Team unavailable"');
  });
});
