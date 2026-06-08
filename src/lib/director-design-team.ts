/**
 * Wireline Design Studio — Spectrum Desk: OpenRouter-ranked linear pipeline.
 *
 * Research → layout scout → imagine → Qwen build → Sonnet critic → MiniMax finish.
 * Optional single Hy3 challenger if pass-1 quality gate fails. No architect tournament.
 */
import { CLAUDE_MODELS, GEMINI_MODELS } from "./claude-models";

export type DesignTeamProvider = "wireline" | "openrouter" | "gemini";

export interface DesignTeamOpenRouterRole {
  provider: "openrouter";
  openRouterModelId: string;
  label: string;
  fallbackOpenRouterModelId?: string;
  fallbackLabel?: string;
}

export interface DesignTeamWirelineRole {
  provider: "wireline";
  wirelineModel: string;
  label: string;
}

export interface DesignTeamGeminiRole {
  provider: "gemini";
  geminiModel: string;
  label: string;
}

export type DesignTeamModelRef =
  | DesignTeamOpenRouterRole
  | DesignTeamWirelineRole
  | DesignTeamGeminiRole;

export interface DesignArchitectSlot {
  id: string;
  openRouterModelId: string;
  label: string;
}

export interface DesignImageReferenceConfig {
  enabled: boolean;
  openRouterModelId: string;
  label: string;
}

/** Minimum deterministic score to stop early (after minRefinementPasses). */
export const DESIGN_CODE_REVIEW_PASS_SCORE = 8;

/** Focus for each refinement pass — merged into builder / finisher prompts. */
export const DESIGN_PASS_FOCUS = {
  1: "Foundation — bold layout archetype, hero hierarchy, primary CTA, realistic US industry copy, mobile grid.",
  2: "Components — pill trust badges, real button CTAs (not text links), typography scale, spacing rhythm, surface depth.",
  3: "Production — WCAG AA contrast, 44px touch targets, focus states, micro-copy polish, premium agency finish.",
} as const;

export type DesignPassNumber = 1 | 2 | 3;

/** Legacy Western premium roster — kept for reference and fallbacks. */
export const WIRELINE_DESIGN_TEAM_CLASSIC = {
  researcher: {
    provider: "wireline" as const,
    wirelineModel: CLAUDE_MODELS.OPUS_4_6,
    label: "Claude Opus 4.6",
  },
  builder: {
    provider: "openrouter" as const,
    openRouterModelId: "x-ai/grok-4.3",
    label: "Grok 4.3",
    fallbackOpenRouterModelId: "anthropic/claude-sonnet-4.6",
    fallbackLabel: "Claude Sonnet 4.6",
  },
  visualRefiner: {
    provider: "gemini" as const,
    geminiModel: GEMINI_MODELS.PRO_3_1,
    label: "Gemini 3.1 Pro",
  },
  codeReviewer: {
    provider: "wireline" as const,
    wirelineModel: CLAUDE_MODELS.OPUS_4_6,
    label: "Claude Opus 4.6",
  },
  finalApprover: {
    provider: "wireline" as const,
    wirelineModel: CLAUDE_MODELS.OPUS_4_6,
    label: "Claude Opus 4.6",
  },
  imageReference: {
    enabled: true,
    openRouterModelId: "x-ai/grok-imagine-image-quality",
    label: "Grok Imagine Image Quality",
  },
  minRefinementPasses: 2 as DesignPassNumber,
  maxRefinementPasses: 3 as DesignPassNumber,
  passScore: DESIGN_CODE_REVIEW_PASS_SCORE,
} as const;

/** Pacific Desk — prior tournament roster (reference only). */
export const WIRELINE_DESIGN_TEAM_PACIFIC = {
  id: "pacific" as const,
  researcher: {
    provider: "openrouter" as const,
    openRouterModelId: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
  },
  layoutScout: {
    provider: "openrouter" as const,
    openRouterModelId: "bytedance-seed/seed-2.0-lite",
    label: "ByteDance Seed 2.0 Lite",
  },
  architects: [
    { id: "kimi", openRouterModelId: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
    { id: "step", openRouterModelId: "stepfun/step-3.7-flash", label: "Step 3.7 Flash" },
    { id: "hy3", openRouterModelId: "tencent/hy3-preview", label: "Tencent Hy3" },
  ] as const satisfies readonly DesignArchitectSlot[],
  pass2Architects: [
    { id: "kimi", openRouterModelId: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
    { id: "step", openRouterModelId: "stepfun/step-3.7-flash", label: "Step 3.7 Flash" },
  ] as const satisfies readonly DesignArchitectSlot[],
  htmlEngineer: {
    provider: "openrouter" as const,
    openRouterModelId: "qwen/qwen3-coder-plus",
    label: "Qwen3 Coder Plus",
  },
  visualCritic: {
    provider: "openrouter" as const,
    openRouterModelId: "z-ai/glm-5v-turbo",
    label: "GLM 5V Turbo",
  },
  productionFinisher: {
    provider: "openrouter" as const,
    openRouterModelId: "minimax/minimax-m2.5",
    label: "MiniMax M2.5",
  },
  usLocalization: {
    provider: "openrouter" as const,
    openRouterModelId: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
  },
  imageReference: {
    enabled: true,
    openRouterModelId: "x-ai/grok-imagine-image-quality",
    label: "Grok Imagine Image Quality",
  },
  altImageReference: {
    enabled: true,
    openRouterModelId: "google/gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
  },
  votingPasses: 2 as DesignPassNumber,
  minRefinementPasses: 2 as DesignPassNumber,
  maxRefinementPasses: 3 as DesignPassNumber,
  passScore: DESIGN_CODE_REVIEW_PASS_SCORE,
} as const;

/** Spectrum Desk — active Design Studio roster (OpenRouter usage-aligned). */
export const WIRELINE_DESIGN_TEAM_SPECTRUM = {
  id: "spectrum" as const,
  researcher: {
    provider: "openrouter" as const,
    openRouterModelId: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    fallbackOpenRouterModelId: "deepseek/deepseek-v4-flash",
    fallbackLabel: "DeepSeek V4 Flash",
  },
  layoutScout: {
    provider: "openrouter" as const,
    openRouterModelId: "stepfun/step-3.7-flash",
    label: "Step 3.7 Flash",
  },
  htmlBuilder: {
    provider: "openrouter" as const,
    openRouterModelId: "qwen/qwen3-coder-plus",
    label: "Qwen3 Coder Plus",
    fallbackOpenRouterModelId: "qwen/qwen3-coder",
    fallbackLabel: "Qwen3 Coder",
  },
  /** One-shot Hy3 draft when pass-1 quality gate fails (not a tournament). */
  optionalChallenger: {
    id: "hy3",
    openRouterModelId: "tencent/hy3-preview",
    label: "Tencent Hy3",
  } as const satisfies DesignArchitectSlot,
  visualCritic: {
    provider: "openrouter" as const,
    openRouterModelId: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    fallbackOpenRouterModelId: "z-ai/glm-5v-turbo",
    fallbackLabel: "GLM 5V Turbo",
  },
  productionFinisher: {
    provider: "openrouter" as const,
    openRouterModelId: "minimax/minimax-m3",
    label: "MiniMax M3",
    fallbackOpenRouterModelId: "minimax/minimax-m2.5",
    fallbackLabel: "MiniMax M2.5",
  },
  usLocalization: {
    provider: "openrouter" as const,
    openRouterModelId: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    fallbackOpenRouterModelId: "anthropic/claude-haiku-4.5",
    fallbackLabel: "Claude Haiku 4.5",
  },
  imageReference: {
    enabled: true,
    openRouterModelId: "google/gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
  },
  altImageReference: {
    enabled: true,
    openRouterModelId: "x-ai/grok-imagine-image-quality",
    label: "Grok Imagine Image Quality",
  },
  enableOptionalChallenger: true,
  minRefinementPasses: 2 as DesignPassNumber,
  maxRefinementPasses: 3 as DesignPassNumber,
  passScore: DESIGN_CODE_REVIEW_PASS_SCORE,
} as const;

/** Active studio configuration. */
export const WIRELINE_DESIGN_TEAM = WIRELINE_DESIGN_TEAM_SPECTRUM;

export type SpectrumDesignTeam = typeof WIRELINE_DESIGN_TEAM_SPECTRUM;

export function isSpectrumDesignTeam(
  team: typeof WIRELINE_DESIGN_TEAM,
): team is SpectrumDesignTeam {
  return "id" in team && team.id === "spectrum";
}

export const WIRELINE_DESIGN_STUDIO_REASONING =
  "Spectrum Desk — DeepSeek brief, Step layout, Qwen build, Sonnet critique, MiniMax finish (2–3 passes)";

export function designTeamThinkingSummary(phases: string[]): string {
  return phases.filter(Boolean).join(" · ");
}

export type DesignStudioStage =
  | "build"
  | "challenger"
  | "engineer"
  | "critic"
  | "finisher"
  | "gate"
  | "localize";

export function designStudioProgressLabel(
  pass: DesignPassNumber,
  stage: DesignStudioStage,
): string {
  const labels: Record<DesignStudioStage, string> = {
    build: `Pass ${pass} — building HTML structure…`,
    challenger: "Optional Hy3 layout challenger…",
    engineer: `Pass ${pass} — engineering components…`,
    critic: `Pass ${pass} — visual design critique…`,
    finisher: `Pass ${pass} — production finish…`,
    gate: "Quality gate — Stitch checks…",
    localize: "US copy and trust localization…",
  };
  return labels[stage];
}

/** @deprecated Pacific tournament only — Spectrum returns none. */
export function architectsForVotePass(_pass: DesignPassNumber): readonly DesignArchitectSlot[] {
  return [];
}

/** @deprecated Pacific tournament only — Spectrum never votes. */
export function shouldRunArchitectVote(_pass: DesignPassNumber): boolean {
  return false;
}
