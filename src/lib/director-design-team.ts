/**
 * Wireline Design Studio — Spectrum Desk: three-model linear pipeline.
 *
 * Kimi K2.6 (latest) — research, layout, critique, US copy.
 * Tencent Hy3 — high-fidelity HTML build.
 * MiniMax M3 — production finish.
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
  1: "Vision pass — implement the full 5k spec: every section, hero photography slot, trust row, services, footer, embedded kit CSS.",
  2: "Component pass — fix critic/gate issues only: real wl-btn CTAs, trust badges, type scale, spacing, keep layout.",
  3: "Ship pass — WCAG AA, 44px targets, focus rings, US microcopy polish — minimal structural change.",
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

/** Latest Kimi on OpenRouter (K2.6 — no K2.7 slug yet). */
export const SPECTRUM_KIMI_MODEL = "moonshotai/kimi-k2.6";

/** Tencent Hy3 — primary HTML builder. */
export const SPECTRUM_HY3_MODEL = "tencent/hy3-preview";

/** MiniMax M3 — production finisher. */
export const SPECTRUM_MINIMAX_M3_MODEL = "minimax/minimax-m3";

/** Spectrum Desk — active Design Studio roster (Kimi · Hy3 · M3). */
export const WIRELINE_DESIGN_TEAM_SPECTRUM = {
  id: "spectrum" as const,
  researcher: {
    provider: "openrouter" as const,
    openRouterModelId: SPECTRUM_KIMI_MODEL,
    label: "Kimi K2.6",
  },
  layoutScout: {
    provider: "openrouter" as const,
    openRouterModelId: SPECTRUM_KIMI_MODEL,
    label: "Kimi K2.6",
  },
  htmlBuilder: {
    provider: "openrouter" as const,
    openRouterModelId: SPECTRUM_HY3_MODEL,
    label: "Tencent Hy3",
    fallbackOpenRouterModelId: SPECTRUM_KIMI_MODEL,
    fallbackLabel: "Kimi K2.6",
  },
  optionalChallenger: {
    id: "hy3",
    openRouterModelId: SPECTRUM_HY3_MODEL,
    label: "Tencent Hy3",
  } as const satisfies DesignArchitectSlot,
  visualCritic: {
    provider: "openrouter" as const,
    openRouterModelId: SPECTRUM_KIMI_MODEL,
    label: "Kimi K2.6",
  },
  productionFinisher: {
    provider: "openrouter" as const,
    openRouterModelId: SPECTRUM_MINIMAX_M3_MODEL,
    label: "MiniMax M3",
    fallbackOpenRouterModelId: "minimax/minimax-m2.5",
    fallbackLabel: "MiniMax M2.5",
  },
  usLocalization: {
    provider: "openrouter" as const,
    openRouterModelId: SPECTRUM_KIMI_MODEL,
    label: "Kimi K2.6",
  },
  /** Off the live wire — operator-facing sign-off copy and preview title. */
  finalApprover: {
    provider: "wireline" as const,
    wirelineModel: CLAUDE_MODELS.OPUS,
    label: "Claude Opus",
  },
  imageReference: {
    enabled: true,
    openRouterModelId: "x-ai/grok-imagine-image-quality",
    label: "Grok Imagine Image Quality",
  },
  altImageReference: {
    enabled: false,
    openRouterModelId: "x-ai/grok-imagine-image-quality",
    label: "Grok Imagine Image Quality",
  },
  enableOptionalChallenger: false,
  /** Exit when quality gate passes; pass 2 only when pass 1 misses the bar. */
  minRefinementPasses: 1 as DesignPassNumber,
  maxRefinementPasses: 2 as DesignPassNumber,
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
  "Spectrum Desk — Kimi research & critique, Hy3 HTML build, MiniMax M3 finish, Opus sign-off";

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
    challenger: "Hy3 layout refinement…",
    engineer: `Pass ${pass} — engineering components…`,
    critic: `Pass ${pass} — visual design critique…`,
    finisher: `Pass ${pass} — production finish…`,
    gate: "Quality gate — production checks…",
    localize: "US copy polish and Opus sign-off…",
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
