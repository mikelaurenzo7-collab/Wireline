/**
 * Expert prompts for the Wireline Design Studio pipeline (Spectrum Desk).
 *
 * Pass 1: Claude Design–style high-fidelity vision spec (~5k chars) → full HTML draft.
 * Pass 2+: Short delta prompts — fix list + incumbent HTML only.
 */
import { buildDesignStageContext, sliceDesignBrief } from "./director-design-context";
import { DESIGN_KIT_PROMPT_BLOCK } from "./director-design-kit";
import { buildDesignVisionSpec } from "./director-design-vision";
import { DESIGN_PASS_FOCUS, type DesignPassNumber } from "./director-design-team";

export const DESIGN_OPUS_VISION_SYSTEM = `You are the creative director for Wireline Design Studio.
Before any HTML is built, you envision the most immaculate, flawless, professional, and tailored
landing-page concept for this specific operator and their business.

Your output is the authoritative brief the Kimi/DeepSeek build desk will draft; you will critique and finish the HTML yourself afterward.

Requirements for creativeVision:
- Write as a creative director pitching a bespoke agency concept — not generic SaaS templates
- Name the business, audience, geography, and conversion goal explicitly
- Specify palette (hex), typography pairing (Google Fonts), layout archetype, hero structure, section order
- Call out trust signals, CTA hierarchy, and copy tone (American English)
- Describe what makes this design unmistakably for THIS business — not a category cliché
- 600–1200 words of dense, actionable art direction

Requirements for designBriefExtension:
- Markdown sections that extend design.md: Section map, Copy bank (headlines/CTAs), Accessibility notes, Design tokens
- Every section from hero through footer with concrete content direction
- No HTML`;

export const DESIGN_OPUS_VISION_TOOL = {
  name: "wireline_design_opus_vision",
  description: "Tailored creative vision and extended design.md for the build pipeline",
  input_schema: {
    type: "object" as const,
    properties: {
      creativeVision: {
        type: "string",
        description: "Immaculate tailored creative vision for this operator",
      },
      designBriefExtension: {
        type: "string",
        description: "Markdown sections to append to design.md (section map, copy bank, tokens)",
      },
    },
    required: ["creativeVision", "designBriefExtension"],
  },
};

export const DESIGN_RESEARCH_SYSTEM = `You are the lead design researcher for Wireline Spectrum Desk.
You receive the operator request, Opus creative vision, and design.md. Extend — do not contradict Opus.
Output structured creative direction only — no HTML.

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
export const DESIGN_BUILDER_VISION_SYSTEM = `You are the HTML build desk for Wireline Design Studio (Kimi / DeepSeek on OpenRouter — pass 1, high fidelity).
You receive an exhaustive vision spec (~5000 characters). Implement it completely in one HTML file.

Rules:
- Output ONLY a complete HTML document — no markdown fences, no commentary.
- Single file: <!doctype html>, one embedded <style> block with full Wireline kit CSS, semantic landmarks.
- Google Fonts via <link> (display + UI sans — avoid Inter-only unless spec requests).
- Realistic US local-business copy — no lorem ipsum.
- Every section in the vision spec must appear in the page (hero, trust row, content, footer).
- CTAs: wl-btn wl-btn--primary (min 48px height) — never bare text links for primary actions.
- Match the layout archetype and visual system in the spec — distinctive, not template-like.
- Prototype interactivity: include a working nav (anchor links to section ids OR data-nav-page + data-page
  blocks for multi-screen flows). Operators must be able to click through the preview — not a static poster.

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

export const DESIGN_PRODUCTION_FINISHER_SYSTEM = `You are the production finisher on Wireline Spectrum Desk (MiniMax M3).
Apply critic notes, Opus vision, and pass focus. Output ONLY the complete polished HTML document.

Requirements:
- Full Wireline Design Kit in <style>
- Polished typographic or gradient hero — embedded CSS only, no external image dependencies
- Agency-grade mobile hero, ≥2 KB document, embedded CSS only
- Match Opus palette, typography, and section map exactly
- No markdown fences`;

export const DESIGN_OPUS_SIGNOFF_SYSTEM = `You are the final sign-off editor for Wireline Design Studio (Claude Opus).
The build-desk HTML page is complete. Write the operator-facing chat summary.

operatorReply: plain language (no HTML, no model names). Opening line + 3–5 bullets on what they see + 2 tweak ideas.
pageTitle: short preview title (under 60 chars).`;

/** @deprecated M3 removed — use DESIGN_OPUS_SIGNOFF_SYSTEM */
export const DESIGN_M3_SIGNOFF_SYSTEM = DESIGN_OPUS_SIGNOFF_SYSTEM;

export const DESIGN_EMERGENCY_POLISH_SYSTEM = `You are the emergency HTML finisher for Wireline Design Studio (build desk).
The HTML failed quality gate checks. Output ONLY the fixed complete HTML document.

Requirements:
- Include the full Wireline Design Kit CSS in <style>
- wl-page, wl-hero, wl-headline, wl-btn--primary, wl-trust-row with wl-badge components
- Embedded styles only; ≥2 KB; agency-grade mobile hero
- No markdown fences`;

export const DESIGN_BUILDER_SYSTEM = DESIGN_UI_ARCHITECT_SYSTEM;

export function buildDesignResearchUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
}): string {
  return buildDesignStageContext({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    opusVisionNotes: input.opusVisionNotes,
  });
}

export function buildDesignBuilderUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  researchNotes?: string;
  revisionNotes?: string;
  priorHtml?: string;
  passNumber: DesignPassNumber;
  layoutScoutNotes?: string;
  architectLabel?: string;
  pipelinePhases?: string[];
}): string {
  if (input.passNumber === 1 && !input.priorHtml?.trim()) {
    const vision = buildDesignVisionSpec({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      opusVisionNotes: input.opusVisionNotes,
      researchNotes: input.researchNotes,
      layoutScoutNotes: input.layoutScoutNotes,
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
  const briefExcerpt = sliceDesignBrief(
    input.designBriefMarkdown,
    input.passNumber === 2 ? 8_000 : 4_000,
  );
  const htmlSlice = input.html.trim().slice(0, input.passNumber === 2 ? 22_000 : 18_000);
  const parts = [
    `Pass ${input.passNumber} refinement — apply focus only, keep what works.`,
    `## Focus\n${DESIGN_PASS_FOCUS[input.passNumber]}`,
    `## Operator intent\n${input.operatorMessage.trim()}`,
    `## design.md\n${briefExcerpt}`,
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
  opusVisionNotes?: string;
  researchNotes?: string;
  html: string;
  passNumber: DesignPassNumber;
}): string {
  const htmlCap = input.passNumber === 1 ? 20_000 : 14_000;
  return [
    `Pass ${input.passNumber} critique — ${DESIGN_PASS_FOCUS[input.passNumber]}`,
    buildDesignStageContext({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      opusVisionNotes: input.opusVisionNotes,
      researchNotes: input.researchNotes,
      briefCap: input.passNumber === 1 ? 8_000 : 4_000,
    }),
    `## HTML\n${input.html.trim().slice(0, htmlCap)}`,
  ].join("\n\n");
}

export function buildFinisherUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  researchNotes?: string;
  html: string;
  passNumber: DesignPassNumber;
  criticNotes?: string;
  revisionNotes?: string;
  pipelinePhases?: string[];
}): string {
  const parts = [
    `Pass ${input.passNumber} finish — ${DESIGN_PASS_FOCUS[input.passNumber]}`,
    buildDesignStageContext({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      opusVisionNotes: input.opusVisionNotes,
      researchNotes: input.researchNotes,
      pipelinePhases: input.pipelinePhases,
      revisionNotes: input.revisionNotes,
      criticNotes: input.criticNotes,
      briefCap: input.passNumber === 1 ? 8_000 : 4_000,
    }),
    DESIGN_KIT_PROMPT_BLOCK,
  ];
  const htmlCap = input.passNumber === 1 ? 24_000 : 16_000;
  parts.push(`## HTML to finish\n${input.html.trim().slice(0, htmlCap)}`);
  return parts.join("\n\n");
}

export function buildOpusSignoffUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  html: string;
  passCount: number;
  pipelinePhases: string[];
}): string {
  return [
    `Completed ${input.passCount} build-desk pass(es).`,
    buildDesignStageContext({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      opusVisionNotes: input.opusVisionNotes,
      pipelinePhases: input.pipelinePhases,
      briefCap: 6_000,
    }),
    `## Final HTML (excerpt)\n${input.html.slice(0, 14_000)}`,
  ].join("\n\n");
}

/** @deprecated Use buildOpusSignoffUserPrompt */
export const buildM3SignoffUserPrompt = buildOpusSignoffUserPrompt;

export const DESIGN_GEMINI_VISUAL_SYSTEM = DESIGN_PRODUCTION_FINISHER_SYSTEM;

export function buildGeminiVisualUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
  revisionNotes?: string;
}): string {
  return buildFinisherUserPrompt({
    ...input,
    criticNotes: input.revisionNotes,
  });
}

/** Opus critiques builder draft and returns production HTML via completion (not tool — avoids truncation). */
export const DESIGN_OPUS_IMPLEMENT_SYSTEM = `You are the creative director finishing a Wireline Design page.

The Kimi/DeepSeek build desk produced a first draft. Critique it against your creative vision and design.md, then output the production-ready HTML yourself.

Rules:
- Output ONLY a complete HTML document — no markdown fences, no commentary
- Embedded Wireline Design Kit CSS in <style>; fix wireframe stubs, text-link CTAs, missing sections
- Preserve strong builder structure when it matches the brief — surgical fixes over full rewrites
- wl-page, wl-hero, wl-headline, wl-btn--primary, wl-trust-row, wl-badge; embedded CSS only`;

/** @deprecated HTML in structured tools truncates — use DESIGN_OPUS_IMPLEMENT_SYSTEM + runCompletion */
export const DESIGN_OPUS_FINISH_SYSTEM = DESIGN_OPUS_IMPLEMENT_SYSTEM;

/** @deprecated Grok round-trip removed — Opus implements fixes directly */
export const DESIGN_OPUS_HTML_REVIEW_SYSTEM = DESIGN_OPUS_FINISH_SYSTEM;

/** @deprecated alias */
export const DESIGN_CODE_REVIEWER_SYSTEM = DESIGN_OPUS_FINISH_SYSTEM;

export const DESIGN_FINAL_APPROVER_SYSTEM = DESIGN_OPUS_SIGNOFF_SYSTEM;

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

export const DESIGN_OPUS_FINISH_TOOL = {
  name: "wireline_design_opus_finish",
  description: "Critique builder draft, output polished HTML plus operator summary",
  input_schema: {
    type: "object" as const,
    properties: {
      html: { type: "string", description: "Complete polished HTML document" },
      operatorReply: { type: "string", description: "Operator-facing chat summary" },
      pageTitle: { type: "string", description: "Short preview card title" },
    },
    required: ["html", "operatorReply", "pageTitle"],
  },
};

/** @deprecated Use DESIGN_OPUS_FINISH_TOOL */
export const DESIGN_OPUS_HTML_REVIEW_TOOL = DESIGN_OPUS_FINISH_TOOL;

/** @deprecated Use DESIGN_OPUS_FINISH_TOOL */
export const DESIGN_CODE_REVIEW_TOOL = DESIGN_OPUS_FINISH_TOOL;

export function buildOpusImplementUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  draftHtml: string;
  pipelinePhases?: string[];
}): string {
  return [
    "Critique the build-desk draft against your vision, then output the finished HTML document.",
    buildDesignStageContext({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      opusVisionNotes: input.opusVisionNotes,
      pipelinePhases: input.pipelinePhases,
      briefCap: 6_000,
    }),
    DESIGN_KIT_PROMPT_BLOCK,
    `## Build desk draft\n${input.draftHtml.slice(0, 20_000)}`,
  ].join("\n\n");
}

/** @deprecated Use buildOpusImplementUserPrompt */
export const buildOpusFinishUserPrompt = buildOpusImplementUserPrompt;

/** @deprecated Use buildOpusImplementUserPrompt — accepts legacy \`html\` key */
export function buildOpusHtmlReviewUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  draftHtml?: string;
  html?: string;
  pipelinePhases?: string[];
}): string {
  return buildOpusImplementUserPrompt({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    opusVisionNotes: input.opusVisionNotes,
    draftHtml: input.draftHtml ?? input.html ?? "",
    pipelinePhases: input.pipelinePhases,
  });
}
