/**
 * Expert prompts for the Wireline Design Studio pipeline.
 * Inspired by Claude Design: design system, structured brief, live handoff — without exposing models.
 */
import { CLIENT_STITCH_DELIVERY_BRIEF } from "./director-stitch-intent";
import type { DesignCreativeConsultant } from "./director-design-team";

export const DESIGN_BUILDER_SYSTEM = `You are the implementation engineer for Wireline Design Studio.
You receive a structured creative brief and design.md. Output ONLY a complete HTML document.

Rules:
- Single file: <!doctype html>, one <style> block, semantic landmarks, WCAG AA contrast.
- Google Fonts via link tags only (no @import in CSS).
- Realistic industry copy — no lorem ipsum, no placeholder "Your Company Here".
- CSS custom properties for palette; mobile-first unless brief says desktop.
- Under 200 lines of HTML total. No markdown fences. No explanation outside HTML.
- Avoid generic AI SaaS purple gradients and Inter-only layouts unless brief requests them.`;

export function buildDesignBuilderUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  creativeNotes?: string;
  revisionNotes?: string;
  priorHtml?: string;
}): string {
  const parts = [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## design.md\n${input.designBriefMarkdown.trim()}`,
    `## Delivery standards\n${CLIENT_STITCH_DELIVERY_BRIEF}`,
  ];
  if (input.creativeNotes?.trim()) {
    parts.push(`## Creative studio notes (mood + market — follow, do not quote verbatim)\n${input.creativeNotes.trim()}`);
  }
  if (input.revisionNotes?.trim()) {
    parts.push(`## Revision required (apply precisely, keep what works)\n${input.revisionNotes.trim()}`);
  }
  if (input.priorHtml?.trim()) {
    parts.push(`## Prior HTML (revise this document)\n${input.priorHtml.trim().slice(0, 24_000)}`);
  }
  return parts.join("\n\n");
}

export const DESIGN_CRITIC_SONNET_SYSTEM = `You are a senior UX critic reviewing a landing-page HTML prototype.
Score honestly. Be harsh on generic templates, weak hierarchy, and inaccessible contrast.
Return structured scores via the tool only.`;

export const DESIGN_CRITIC_GEMINI_SYSTEM = `You are a visual brand critic reviewing HTML/CSS prototypes.
Score distinctiveness, typography pairing, spacing rhythm, and industry fit.
Flag "generic AI template" aesthetics. Return JSON only as specified.`;

export const DESIGN_FINAL_REVIEWER_SYSTEM = `You are the creative director final reviewer for Wireline Design Studio.
You receive HTML plus two independent critic reports. Decide:
- approve: ship as-is
- revise: one targeted revision list for the builder (max 8 bullets, specific CSS/structure fixes)

Also write operatorReply: plain language for a non-technical business owner (no HTML, no model names).
Structure: one opening line celebrating the page, 3–5 bullets on what they're seeing, 2–3 suggested next tweaks in chat.
Never mention Stitch, APIs, or "prototype" — say "your page" or "your design".`;

export function buildCreativeConsultantPrompt(
  consultant: DesignCreativeConsultant,
  operatorMessage: string,
  designBriefMarkdown: string,
): { system: string; user: string } {
  const base = `Operator request:\n${operatorMessage}\n\n## design.md\n${designBriefMarkdown.slice(0, 2000)}`;
  if (consultant.role === "market_signals") {
    return {
      system:
        "You are a market research consultant for web design. In 120 words max, list category-specific trust signals, competitor visual clichés to avoid, and one unexpected angle for this industry. No HTML. Bullet points only.",
      user: base,
    };
  }
  if (consultant.role === "visual_mood") {
    return {
      system:
        "You are an art director. In 100 words max, describe typography pairing, palette tension, photography style, and layout archetype (editorial / split hero / card grid). No HTML. No code.",
      user: base,
    };
  }
  return {
    system: "Summarize brand voice for web copy in 80 words. No HTML.",
    user: base,
  };
}

export const DESIGN_CRITIC_TOOL = {
  name: "wireline_design_critique",
  description: "Structured UX/visual critique scores for an HTML landing page",
  input_schema: {
    type: "object" as const,
    properties: {
      overall: { type: "number", description: "1-10 overall quality" },
      hierarchy: { type: "number", description: "1-10 visual hierarchy and CTA clarity" },
      mobile: { type: "number", description: "1-10 mobile readiness" },
      accessibility: { type: "number", description: "1-10 contrast and semantics" },
      distinctiveness: { type: "number", description: "1-10 avoids generic AI template look" },
      industry_fit: { type: "number", description: "1-10 matches operator industry and tone" },
      strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
      issues: { type: "array", items: { type: "string" }, maxItems: 6 },
    },
    required: ["overall", "hierarchy", "mobile", "accessibility", "distinctiveness", "industry_fit", "issues"],
  },
};

export const DESIGN_FINAL_REVIEW_TOOL = {
  name: "wireline_design_final_review",
  description: "Final approve/revise decision and operator-facing copy",
  input_schema: {
    type: "object" as const,
    properties: {
      decision: { type: "string", enum: ["approve", "revise"] },
      revisionNotes: { type: "string", description: "Builder instructions when decision is revise" },
      operatorReply: { type: "string", description: "Non-technical summary for chat" },
      pageTitle: { type: "string", description: "Short title for preview card" },
    },
    required: ["decision", "operatorReply", "pageTitle"],
  },
};
