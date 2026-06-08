/**
 * Shared context blocks for Spectrum Desk — every stage sees prompt, brief, Opus vision, and prior work.
 */

/** Max design.md chars passed to Grok Build and Opus implement prompts. */
export const DESIGN_BRIEF_CONTEXT_CHARS = 12_000;

/** Max design.md chars for Opus vision input (full starter brief). */
export const DESIGN_BRIEF_OPUS_INPUT_CHARS = 8_000;

export interface OpusDesignVisionResult {
  creativeVision: string;
  designBriefExtension: string;
}

export interface DesignStageContextInput {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  researchNotes?: string;
  layoutScoutNotes?: string;
  pipelinePhases?: string[];
  revisionNotes?: string;
  criticNotes?: string;
  designProfileAssetNotes?: string;
  briefCap?: number;
}

export function sliceDesignBrief(markdown: string, cap = DESIGN_BRIEF_CONTEXT_CHARS): string {
  const trimmed = markdown.trim();
  if (trimmed.length <= cap) return trimmed;
  return `${trimmed.slice(0, cap)}\n\n…(design.md truncated for context window)`;
}

export function enrichDesignBriefWithOpusVision(
  baseMarkdown: string,
  vision: OpusDesignVisionResult,
): { designBriefMarkdown: string; opusVisionNotes: string } {
  const opusVisionNotes = vision.creativeVision.trim();
  const extension = vision.designBriefExtension.trim();
  const designBriefMarkdown = [
    baseMarkdown.trim(),
    "",
    "## Opus creative vision (authoritative — implement exactly)",
    opusVisionNotes,
    extension ? `\n${extension}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { designBriefMarkdown, opusVisionNotes };
}

export function buildDesignStageContext(input: DesignStageContextInput): string {
  const parts = [
    "## Operator request (verbatim)",
    input.operatorMessage.trim(),
    "",
    "## design.md",
    sliceDesignBrief(input.designBriefMarkdown, input.briefCap ?? DESIGN_BRIEF_CONTEXT_CHARS),
  ];

  if (input.opusVisionNotes?.trim()) {
    parts.push("", "## Opus creative vision", input.opusVisionNotes.trim());
  }
  if (input.researchNotes?.trim()) {
    parts.push("", "## Kimi research synthesis", input.researchNotes.trim());
  }
  if (input.layoutScoutNotes?.trim()) {
    parts.push("", "## Layout scout archetypes", input.layoutScoutNotes.trim());
  }
  if (input.pipelinePhases?.length) {
    parts.push("", "## Pipeline work completed so far", input.pipelinePhases.join(" · "));
  }
  if (input.revisionNotes?.trim()) {
    parts.push("", "## Quality / revision notes", input.revisionNotes.trim());
  }
  if (input.criticNotes?.trim()) {
    parts.push("", "## Visual critic notes", input.criticNotes.trim());
  }
  if (input.designProfileAssetNotes?.trim()) {
    parts.push("", "## Design system profile assets", input.designProfileAssetNotes.trim());
  }

  return parts.join("\n");
}
