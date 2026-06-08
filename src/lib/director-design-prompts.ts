/**
 * Expert prompts for the Wireline Design Studio pipeline (Spectrum Desk).
 */
import { DESIGN_KIT_PROMPT_BLOCK } from "./director-design-kit";
import { CLIENT_STITCH_DELIVERY_BRIEF } from "./director-stitch-intent";
import { DESIGN_PASS_FOCUS, type DesignPassNumber } from "./director-design-team";

export const DESIGN_RESEARCH_SYSTEM = `You are the lead design researcher for Wireline Spectrum Desk.
Study the operator request and design.md. Output structured creative direction only — no HTML.

Cover in bullet points:
1. US audience + conversion goal (phone calls, bookings, quotes)
2. Category trust signals and clichés to avoid (no generic purple SaaS)
3. Typography pairing, palette tension, layout archetype — aim for distinctive, not template
4. Brand voice for headlines and CTAs (American English, local business tone)
5. One visual angle competitors in this vertical miss

Max 400 words. Be specific to the industry.`;

export const DESIGN_LAYOUT_SCOUT_SYSTEM = `You are a layout scout for Wireline Spectrum Desk.
Suggest 3 unconventional layout archetypes for this US local-business page — spatial rhythm, hero shape, section order.
No HTML. Max 150 words. Avoid three-column feature-card grids.`;

export const DESIGN_UI_ARCHITECT_SYSTEM = `You are a UI architect on Wireline Spectrum Desk.
Output ONLY a complete HTML document — distinctive landing-page quality for American local businesses.

Rules:
- Single file: <!doctype html>, one <style> block, semantic landmarks, WCAG AA contrast.
- Google Fonts via <link> only (display + UI sans — avoid Inter-only unless brief requests).
- Realistic US industry copy — no lorem ipsum, no translation-English.
- Mobile-first unless brief says desktop.
- CTAs: <button> or <a class="wl-btn wl-btn--primary"> — never bare text links for primary actions.
- Use Wireline kit classes: wl-page, wl-hero, wl-headline, wl-btn, wl-badge, wl-section.
- Avoid generic AI purple gradients and identical three-card rows.
- No markdown fences. No commentary outside HTML.`;

export const DESIGN_HTML_ENGINEER_SYSTEM = `You are the HTML engineer on Wireline Spectrum Desk.
You receive an architect draft. Output ONLY the improved complete HTML document.

Tighten:
- Semantic structure, kit class vocabulary, component correctness
- Real buttons with padding, radius, min 48px touch targets
- Embedded <style> with full kit CSS foundation
- Preserve the architect's distinctive layout intent — do not flatten to a generic template

No markdown fences. No commentary.`;

export const DESIGN_VISUAL_CRITIC_SYSTEM = `You are the visual design critic on Wireline Spectrum Desk (vision-native).
Review the HTML against the brief. Output revision notes ONLY — no HTML.

Format:
## Strengths (max 3 bullets)
## Must fix (max 8 bullets, actionable CSS/HTML changes)
## Polish (max 4 bullets)

Be harsh on text-link CTAs, flat wireframes, missing trust row, weak hero hierarchy.
Target American SMB trust — licensed, insured, local, phone-first.`;

export const DESIGN_PRODUCTION_FINISHER_SYSTEM = `You are the production finisher on Wireline Spectrum Desk.
Apply critic notes and pass focus. Output ONLY the complete polished HTML document.

Requirements:
- Full Wireline Design Kit in <style>
- wl-hero--photo pattern when photography assets are provided
- Agency-grade mobile hero, ≥2 KB document, embedded CSS only
- No markdown fences`;

export const DESIGN_EMERGENCY_POLISH_SYSTEM = `You are the emergency finisher for Wireline Spectrum Desk.
The HTML failed Stitch-quality checks. Output ONLY the fixed complete HTML document.

Requirements:
- Include the full Wireline Design Kit CSS in <style>
- wl-page, wl-hero, wl-headline, wl-btn--primary, wl-trust-row with wl-badge components
- Embedded styles only; ≥2 KB; agency-grade mobile hero
- No markdown fences`;

export const DESIGN_US_LOCALIZATION_SYSTEM = `You are the US localization editor for Wireline Spectrum Desk.
Polish operator-facing copy in the HTML for American local-business idioms.

Output ONLY the complete HTML document with:
- Natural US English headlines and CTAs (call now, free estimate, licensed & insured)
- Proper phone formatting placeholders if needed
- Trust microcopy that reads local, not translated

Preserve structure and kit classes. No markdown fences.`;

export const DESIGN_BUILDER_SYSTEM = DESIGN_UI_ARCHITECT_SYSTEM;

export function buildDesignBuilderUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  researchNotes?: string;
  revisionNotes?: string;
  priorHtml?: string;
  passNumber: DesignPassNumber;
  imagineAssetsNotes?: string;
  layoutScoutNotes?: string;
  architectLabel?: string;
}): string {
  const parts = [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## design.md\n${input.designBriefMarkdown.trim()}`,
    `## Delivery standards\n${CLIENT_STITCH_DELIVERY_BRIEF}`,
    `## Pass ${input.passNumber} focus\n${DESIGN_PASS_FOCUS[input.passNumber]}`,
    DESIGN_KIT_PROMPT_BLOCK,
  ];
  if (input.architectLabel) {
    parts.push(
      `## Your architect lane\n${input.architectLabel} — bring a distinctive spatial take.`,
    );
  }
  if (input.layoutScoutNotes?.trim()) {
    parts.push(`## Layout scout ideas\n${input.layoutScoutNotes.trim()}`);
  }
  if (input.imagineAssetsNotes?.trim()) {
    parts.push(input.imagineAssetsNotes.trim());
  }
  if (input.researchNotes?.trim()) {
    parts.push(`## Research direction (follow closely)\n${input.researchNotes.trim()}`);
  }
  if (input.revisionNotes?.trim()) {
    parts.push(`## Fix these issues (keep what works)\n${input.revisionNotes.trim()}`);
  }
  if (input.priorHtml?.trim()) {
    parts.push(
      `## Incumbent HTML (pass 2 challenger vote — beat this draft)\n${input.priorHtml.trim().slice(0, 28_000)}`,
    );
  }
  return parts.join("\n\n");
}

export function buildEngineerUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
  researchNotes?: string;
  imagineAssetsNotes?: string;
  winningArchitectLabel?: string;
}): string {
  const parts = [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## Pass ${input.passNumber} engineer focus\n${DESIGN_PASS_FOCUS[input.passNumber]}`,
    `## design.md (excerpt)\n${input.designBriefMarkdown.trim().slice(0, 4000)}`,
    input.winningArchitectLabel ? `## Winning architect\n${input.winningArchitectLabel}` : "",
    input.researchNotes?.trim() ? `## Research\n${input.researchNotes.trim().slice(0, 2000)}` : "",
    input.imagineAssetsNotes?.trim() ? input.imagineAssetsNotes.trim() : "",
    DESIGN_KIT_PROMPT_BLOCK,
    `## Architect HTML to engineer\n${input.html.trim().slice(0, 28_000)}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

export function buildVisualCriticUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
}): string {
  return [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## Pass ${input.passNumber}\n${DESIGN_PASS_FOCUS[input.passNumber]}`,
    `## design.md (excerpt)\n${input.designBriefMarkdown.trim().slice(0, 3000)}`,
    `## HTML to critique\n${input.html.trim().slice(0, 24_000)}`,
  ].join("\n\n");
}

export function buildFinisherUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
  criticNotes?: string;
  revisionNotes?: string;
  imagineAssetsNotes?: string;
}): string {
  const parts = [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## Pass ${input.passNumber} finish focus\n${DESIGN_PASS_FOCUS[input.passNumber]}`,
    `## design.md (excerpt)\n${input.designBriefMarkdown.trim().slice(0, 3000)}`,
  ];
  if (input.criticNotes?.trim()) {
    parts.push(`## Visual critic notes\n${input.criticNotes.trim()}`);
  }
  if (input.revisionNotes?.trim()) {
    parts.push(`## Quality gate fixes\n${input.revisionNotes.trim()}`);
  }
  if (input.imagineAssetsNotes?.trim()) {
    parts.push(input.imagineAssetsNotes.trim());
  }
  parts.push(DESIGN_KIT_PROMPT_BLOCK);
  parts.push(`## HTML to finish\n${input.html.trim().slice(0, 28_000)}`);
  return parts.join("\n\n");
}

export const DESIGN_GEMINI_VISUAL_SYSTEM = DESIGN_PRODUCTION_FINISHER_SYSTEM;

export function buildGeminiVisualUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
  revisionNotes?: string;
  imagineAssetsNotes?: string;
}): string {
  return buildFinisherUserPrompt({
    ...input,
    criticNotes: input.revisionNotes,
  });
}

export const DESIGN_CODE_REVIEWER_SYSTEM = `Strict front-end reviewer — unused in Spectrum Desk (deterministic gate instead).`;

export const DESIGN_FINAL_APPROVER_SYSTEM = `You sign off Wireline Spectrum Desk work for a US business owner.

Write operatorReply: plain language (no HTML, no model names).
Structure: one opening line, 3–5 bullets on what they're seeing, 2–3 chat tweak ideas.
Say "your page" — never prototype or API.

Set pageTitle: short preview title (under 60 chars).`;

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

export const DESIGN_CODE_REVIEW_TOOL = {
  name: "wireline_design_code_review",
  description: "Legacy Opus code review tool",
  input_schema: {
    type: "object" as const,
    properties: {
      decision: { type: "string", enum: ["approve", "revise"] },
      overall: { type: "number" },
      structure: { type: "number" },
      components: { type: "number" },
      visual_polish: { type: "number" },
      mobile: { type: "number" },
      accessibility: { type: "number" },
      strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
      issues: { type: "array", items: { type: "string" }, maxItems: 8 },
      revisionNotes: { type: "string" },
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
