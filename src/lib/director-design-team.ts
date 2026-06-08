/**
 * Wireline Design Studio — multi-model roster with strict role separation.
 *
 * Pipeline: Opus research → Grok build → Gemini visual refine → Opus code review
 * (2–3 evolving passes) → Opus final approval. Only Grok + Gemini emit HTML.
 */
import { CLAUDE_MODELS, GEMINI_MODELS } from "./claude-models";

export type DesignTeamProvider = "wireline" | "openrouter" | "gemini";

export interface DesignTeamModelRef {
  provider: DesignTeamProvider;
  wirelineModel?: string;
  openRouterModelId?: string;
  geminiModel?: string;
  label: string;
}

/** Minimum 1–10 score from code review to stop early (after minRefinementPasses). */
export const DESIGN_CODE_REVIEW_PASS_SCORE = 8;

/** Focus for each refinement pass — merged into builder / reviewer prompts. */
export const DESIGN_PASS_FOCUS = {
  1: "Foundation — semantic structure, hero hierarchy, primary CTA, realistic industry copy, mobile layout grid.",
  2: "Components — pill trust badges, real button CTAs (not text links), typography scale, spacing rhythm, surface depth.",
  3: "Production — WCAG AA contrast, 44px touch targets, focus states, micro-copy polish, premium agency finish.",
} as const;

export type DesignPassNumber = 1 | 2 | 3;

export const WIRELINE_DESIGN_TEAM = {
  /** Industry research + creative direction (no HTML). */
  researcher: {
    provider: "wireline" as const,
    wirelineModel: CLAUDE_MODELS.OPUS_4_6,
    label: "Claude Opus 4.6",
  },
  /** Primary HTML/CSS implementer. */
  builder: {
    provider: "openrouter" as const,
    openRouterModelId: "x-ai/grok-4.3",
    label: "Grok 4.3",
    fallbackOpenRouterModelId: "anthropic/claude-sonnet-4.6",
    fallbackLabel: "Claude Sonnet 4.6",
  },
  /** Visual refinement pass — rewrites HTML for brand and layout quality. */
  visualRefiner: {
    provider: "gemini" as const,
    geminiModel: GEMINI_MODELS.PRO_3_1,
    label: "Gemini 3.1 Pro",
  },
  /** Strict HTML/CSS reviewer — structured scores + revision notes. */
  codeReviewer: {
    provider: "wireline" as const,
    wirelineModel: CLAUDE_MODELS.OPUS_4_6,
    label: "Claude Opus 4.6",
  },
  /** Ships operator copy + page title after passes complete. */
  finalApprover: {
    provider: "wireline" as const,
    wirelineModel: CLAUDE_MODELS.OPUS_4_6,
    label: "Claude Opus 4.6",
  },
  /** Grok Imagine — hero photography + textures (not Grok 4.3). Requires OPENROUTER_API_KEY. */
  imageReference: {
    enabled: true,
    openRouterModelId: "x-ai/grok-imagine-image-quality",
    label: "Grok Imagine Image Quality",
  },
  /** Always run at least this many full build → visual → code loops. */
  minRefinementPasses: 2 as DesignPassNumber,
  /** Stop after this many passes even if code review still wants changes. */
  maxRefinementPasses: 3 as DesignPassNumber,
  passScore: DESIGN_CODE_REVIEW_PASS_SCORE,
} as const;

export const WIRELINE_DESIGN_STUDIO_REASONING =
  "Wireline Design Studio — Opus research, Grok build, Gemini refine, Opus review (2–3 passes)";

export function designTeamThinkingSummary(phases: string[]): string {
  return phases.filter(Boolean).join(" · ");
}

export function designStudioProgressLabel(
  pass: DesignPassNumber,
  stage: "build" | "visual" | "code",
): string {
  const labels = {
    build: `Pass ${pass} — building layout and components…`,
    visual: `Pass ${pass} — refining visual design…`,
    code: `Pass ${pass} — strict code review…`,
  } as const;
  return labels[stage];
}
