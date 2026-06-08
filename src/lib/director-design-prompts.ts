/**
 * Expert prompts for the Wireline Design Studio pipeline.
 */
import { DESIGN_KIT_PROMPT_BLOCK } from "./director-design-kit";
import { CLIENT_STITCH_DELIVERY_BRIEF } from "./director-stitch-intent";
import {
  DESIGN_PASS_FOCUS,
  type DesignPassNumber,
  WIRELINE_DESIGN_TEAM,
} from "./director-design-team";

export const DESIGN_RESEARCH_SYSTEM = `You are the lead design researcher for Wireline Design Studio.
Study the operator request and design.md. Output structured creative direction only — no HTML.

Cover in bullet points:
1. Audience + conversion goal for this screen
2. Category trust signals and clichés to avoid
3. Typography pairing, palette tension, layout archetype
4. Brand voice for headlines and CTAs
5. One distinctive visual angle competitors miss

Max 400 words. Be specific to the industry — no generic SaaS advice.`;

export const DESIGN_BUILDER_SYSTEM = `You are the implementation engineer for Wireline Design Studio.
Output ONLY a complete, production-quality HTML document — agency landing-page quality, not a text document.

Rules:
- Single file: <!doctype html>, one <style> block, semantic landmarks, WCAG AA contrast.
- Google Fonts via <link> tags only (pair a display face + UI sans).
- Realistic industry copy — no lorem ipsum.
- CSS custom properties for palette; mobile-first unless brief says desktop.
- CTAs must be <button> or <a class="btn"> with padding, radius, shadow — never bare text links for primary actions.
- Trust signals as styled pills/cards with icons (Unicode or inline SVG).
- Hero: strong headline scale, subcopy, primary + secondary CTA, optional badge row.
- Up to 400 lines when needed for quality. No markdown fences. No explanation outside HTML.
- Avoid generic AI purple gradients and Inter-only stacks unless the brief requests them.
- Target Stitch-grade polish: embedded CSS, real components, ≥2 KB document size.`;

export function buildDesignBuilderUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  researchNotes?: string;
  revisionNotes?: string;
  priorHtml?: string;
  passNumber: DesignPassNumber;
  imagineAssetsNotes?: string;
}): string {
  const parts = [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## design.md\n${input.designBriefMarkdown.trim()}`,
    `## Delivery standards\n${CLIENT_STITCH_DELIVERY_BRIEF}`,
    `## Pass ${input.passNumber} focus\n${DESIGN_PASS_FOCUS[input.passNumber]}`,
    DESIGN_KIT_PROMPT_BLOCK,
  ];
  if (input.imagineAssetsNotes?.trim()) {
    parts.push(input.imagineAssetsNotes.trim());
  }
  if (input.researchNotes?.trim()) {
    parts.push(`## Research direction (follow closely)\n${input.researchNotes.trim()}`);
  }
  if (input.revisionNotes?.trim()) {
    parts.push(
      `## Fix these issues from code review (keep what already works)\n${input.revisionNotes.trim()}`,
    );
  }
  if (input.priorHtml?.trim()) {
    parts.push(
      `## Prior HTML (revise this document in place)\n${input.priorHtml.trim().slice(0, 28_000)}`,
    );
  }
  return parts.join("\n\n");
}

export const DESIGN_GEMINI_VISUAL_SYSTEM = `You are a senior visual designer refining an HTML/CSS landing page.
You receive HTML plus a brief. Output ONLY the improved complete HTML document.

Elevate:
- Typography hierarchy and font pairing
- Spacing rhythm and section padding
- CTA buttons (size, contrast, hover states)
- Trust badges as polished components
- Background depth (gradients, subtle patterns) when on-brand
- Industry-specific polish — must feel bespoke, not template

Preserve semantic structure and copy intent. Keep Wireline kit classes (wl-btn, wl-headline, wl-badge).
No markdown fences. No commentary.`;

export function buildGeminiVisualUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
  revisionNotes?: string;
  imagineAssetsNotes?: string;
}): string {
  const parts = [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## Pass ${input.passNumber} visual focus\n${DESIGN_PASS_FOCUS[input.passNumber]}`,
    `## design.md (excerpt)\n${input.designBriefMarkdown.trim().slice(0, 3000)}`,
  ];
  if (input.revisionNotes?.trim()) {
    parts.push(`## Code review fixes to apply visually\n${input.revisionNotes.trim()}`);
  }
  if (input.imagineAssetsNotes?.trim()) {
    parts.push(input.imagineAssetsNotes.trim());
  }
  parts.push(DESIGN_KIT_PROMPT_BLOCK);
  parts.push(`## HTML to refine\n${input.html.trim().slice(0, 28_000)}`);
  return parts.join("\n\n");
}

export const DESIGN_EMERGENCY_POLISH_SYSTEM = `You are the final polish engineer for Wireline Design Studio.
The HTML failed Stitch-quality checks. Output ONLY the fixed complete HTML document.

Requirements:
- Include the full Wireline Design Kit CSS in <style>
- wl-page, wl-hero, wl-headline, wl-btn--primary, wl-trust-row with wl-badge components
- Embedded styles only; ≥2 KB; agency-grade mobile hero
- No markdown fences`;

export const DESIGN_CODE_REVIEWER_SYSTEM = `You are the strictest senior front-end engineer reviewing a landing-page HTML prototype.
Score harshly. Reject text-link CTAs, missing touch targets, flat Bootstrap-gray layouts, and generic AI templates.

Return structured output via the tool only.
- approve: all dimension scores meet the bar — no mandatory fixes
- revise: specific CSS/HTML fixes for the next pass (max 10 bullets, actionable)

Be especially strict on pass ${WIRELINE_DESIGN_TEAM.maxRefinementPasses}; on earlier passes allow revise when overall < 8.`;

export const DESIGN_FINAL_APPROVER_SYSTEM = `You are the creative director signing off Wireline Design Studio work.
The HTML has been through ${WIRELINE_DESIGN_TEAM.minRefinementPasses}–${WIRELINE_DESIGN_TEAM.maxRefinementPasses} refinement passes.

Write operatorReply: plain language for a non-technical business owner (no HTML, no model names).
Structure: one opening line celebrating the page, 3–5 bullets on what they're seeing, 2–3 suggested next tweaks in chat.
Never mention Stitch, APIs, or "prototype" — say "your page" or "your design".

Set pageTitle: short preview card title (under 60 chars).`;

export const DESIGN_CODE_REVIEW_TOOL = {
  name: "wireline_design_code_review",
  description: "Strict HTML/CSS code review with pass/fail and revision notes",
  input_schema: {
    type: "object" as const,
    properties: {
      decision: { type: "string", enum: ["approve", "revise"] },
      overall: { type: "number", description: "1-10 ship-ready quality" },
      structure: { type: "number", description: "1-10 semantic HTML and hierarchy" },
      components: { type: "number", description: "1-10 buttons, badges, cards" },
      visual_polish: { type: "number", description: "1-10 typography, spacing, depth" },
      mobile: { type: "number", description: "1-10 mobile readiness" },
      accessibility: { type: "number", description: "1-10 contrast, focus, semantics" },
      strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
      issues: { type: "array", items: { type: "string" }, maxItems: 8 },
      revisionNotes: {
        type: "string",
        description: "Builder instructions when decision is revise",
      },
    },
    required: [
      "decision",
      "overall",
      "structure",
      "components",
      "visual_polish",
      "mobile",
      "accessibility",
      "issues",
    ],
  },
};

export const DESIGN_FINAL_APPROVAL_TOOL = {
  name: "wireline_design_final_approval",
  description: "Operator-facing summary and page title",
  input_schema: {
    type: "object" as const,
    properties: {
      operatorReply: { type: "string", description: "Non-technical summary for chat" },
      pageTitle: { type: "string", description: "Short title for preview card" },
    },
    required: ["operatorReply", "pageTitle"],
  },
};
