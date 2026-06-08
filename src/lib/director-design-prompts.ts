/**
 * Expert prompts for the Wireline Design Studio pipeline (Spectrum Desk).
 *
 * Pass 1: Claude Design–style high-fidelity vision spec (~5k chars) → full HTML draft.
 * Pass 2+: Short delta prompts — fix list + incumbent HTML only.
 */
import { DESIGN_KIT_PROMPT_BLOCK } from "./director-design-kit";
import { buildDesignVisionSpec } from "./director-design-vision";
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

/** Pass 1 — implement the full vision spec (Claude Design high-fidelity mode). */
export const DESIGN_BUILDER_VISION_SYSTEM = `You are the lead UI builder on Wireline Spectrum Desk (pass 1 — high fidelity).
You receive an exhaustive vision spec (~5000 characters). Implement it completely in one HTML file.

Rules:
- Output ONLY a complete HTML document — no markdown fences, no commentary.
- Single file: <!doctype html>, one embedded <style> block with full Wireline kit CSS, semantic landmarks.
- Google Fonts via <link> (display + UI sans — avoid Inter-only unless spec requests).
- Realistic US local-business copy — no lorem ipsum.
- Every section in the vision spec must appear in the page (hero, trust row, content, footer).
- CTAs: wl-btn wl-btn--primary (min 48px height) — never bare text links for primary actions.
- Match the layout archetype and visual system in the spec — distinctive, not template-like.

No markdown fences. No commentary outside HTML.`;

/** Pass 2+ — surgical refinement on incumbent HTML. */
export const DESIGN_BUILDER_REFINEMENT_SYSTEM = `You are refining an existing Wireline Design HTML page (pass 2+).
Output ONLY the improved complete HTML document.

Rules:
- Apply ONLY the pass focus and fix list — preserve layout and copy that already work.
- Do not restart from scratch or flatten to a generic template.
- Keep embedded <style> and Wireline kit classes intact unless a fix requires a CSS tweak.
- No markdown fences. No commentary.`;

export const DESIGN_UI_ARCHITECT_SYSTEM = DESIGN_BUILDER_VISION_SYSTEM;

export const DESIGN_HTML_ENGINEER_SYSTEM = DESIGN_BUILDER_REFINEMENT_SYSTEM;

export const DESIGN_VISUAL_CRITIC_SYSTEM = `You are the visual design critic on Wireline Spectrum Desk.
Review HTML against the brief. Output revision notes ONLY — no HTML.

Format:
## Strengths (max 3 bullets)
## Must fix (max 6 bullets, actionable)
## Polish (max 3 bullets)

Be harsh on text-link CTAs, flat wireframes, missing trust row, weak hero hierarchy.`;

export const DESIGN_PRODUCTION_FINISHER_SYSTEM = `You are the production finisher on Wireline Spectrum Desk.
Apply critic notes and pass focus. Output ONLY the complete polished HTML document.

Requirements:
- Full Wireline Design Kit in <style>
- wl-hero--photo pattern when photography assets are provided
- Agency-grade mobile hero, ≥2 KB document, embedded CSS only
- No markdown fences`;

export const DESIGN_EMERGENCY_POLISH_SYSTEM = `You are the emergency finisher for Wireline Spectrum Desk.
The HTML failed quality gate checks. Output ONLY the fixed complete HTML document.

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
  if (input.passNumber === 1 && !input.priorHtml?.trim()) {
    const vision = buildDesignVisionSpec({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      researchNotes: input.researchNotes,
      layoutScoutNotes: input.layoutScoutNotes,
      imagineAssetsNotes: input.imagineAssetsNotes,
    });
    return [
      vision,
      "",
      `## Pass 1 builder focus\n${DESIGN_PASS_FOCUS[1]}`,
      DESIGN_KIT_PROMPT_BLOCK,
      "Implement the vision spec above as production HTML. Every section in the blueprint must render.",
    ].join("\n");
  }

  return buildDesignRefinementUserPrompt({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    html: input.priorHtml ?? "",
    passNumber: input.passNumber,
    revisionNotes: input.revisionNotes,
    architectLabel: input.architectLabel,
  });
}

/** Pass 2+ — short, focused delta prompt (not a repeat of the 5k vision). */
export function buildDesignRefinementUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
  revisionNotes?: string;
  architectLabel?: string;
}): string {
  const briefExcerpt = input.designBriefMarkdown.trim().slice(0, input.passNumber === 2 ? 1_200 : 600);
  const htmlSlice = input.html.trim().slice(0, input.passNumber === 2 ? 22_000 : 18_000);
  const parts = [
    `Pass ${input.passNumber} refinement — apply focus only, keep what works.`,
    `## Focus\n${DESIGN_PASS_FOCUS[input.passNumber]}`,
    `## Operator intent\n${input.operatorMessage.trim().slice(0, 280)}`,
    `## design.md (excerpt)\n${briefExcerpt}`,
  ];
  if (input.revisionNotes?.trim()) {
    parts.push(`## Must fix\n${input.revisionNotes.trim().slice(0, 2_000)}`);
  }
  if (input.architectLabel) {
    parts.push(`## Challenger lane\n${input.architectLabel} — beat incumbent layout without generic templates.`);
  }
  parts.push(`## Incumbent HTML\n${htmlSlice}`);
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
  revisionNotes?: string;
}): string {
  return buildDesignRefinementUserPrompt({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    html: input.html,
    passNumber: input.passNumber,
    revisionNotes: input.revisionNotes,
    architectLabel: input.winningArchitectLabel,
  });
}

export function buildVisualCriticUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
}): string {
  const briefCap = input.passNumber === 1 ? 2_000 : 800;
  const htmlCap = input.passNumber === 1 ? 20_000 : 14_000;
  return [
    `Pass ${input.passNumber} critique — ${DESIGN_PASS_FOCUS[input.passNumber]}`,
    `Intent: ${input.operatorMessage.trim().slice(0, 200)}`,
    `## design.md\n${input.designBriefMarkdown.trim().slice(0, briefCap)}`,
    `## HTML\n${input.html.trim().slice(0, htmlCap)}`,
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
  const briefCap = input.passNumber === 1 ? 1_500 : 500;
  const parts = [
    `Pass ${input.passNumber} finish — ${DESIGN_PASS_FOCUS[input.passNumber]}`,
    `## design.md\n${input.designBriefMarkdown.trim().slice(0, briefCap)}`,
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
  const htmlCap = input.passNumber === 1 ? 24_000 : 16_000;
  parts.push(`## HTML to finish\n${input.html.trim().slice(0, htmlCap)}`);
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
