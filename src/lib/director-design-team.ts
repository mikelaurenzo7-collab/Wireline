/**
 * Wireline Design Studio — multi-model roster with strict role separation.
 *
 * Creative / research models never emit HTML. Only the builder writes code.
 * Consultants enrich the brief; critics score; Opus approves and writes operator copy.
 */
import { CLAUDE_MODELS, GEMINI_MODELS } from "./claude-models";

export type DesignTeamProvider = "wireline" | "openrouter" | "gemini";

export interface DesignTeamModelRef {
  provider: DesignTeamProvider;
  /** Wireline tier or Anthropic model id */
  wirelineModel?: string;
  /** OpenRouter model slug */
  openRouterModelId?: string;
  /** Gemini API model id */
  geminiModel?: string;
  label: string;
}

export interface DesignCreativeConsultant extends DesignTeamModelRef {
  id: string;
  /** What this model contributes — merged into the builder brief, not into HTML. */
  role: "market_signals" | "visual_mood" | "copy_voice";
  enabled: boolean;
}

/** Minimum 1–10 score from each critic dimension to pass without revision. */
export const DESIGN_CRITIC_PASS_SCORE = 7;

export const WIRELINE_DESIGN_TEAM = {
  /** Primary HTML/CSS implementer — must be code-capable. */
  builder: {
    provider: "openrouter" as const,
    openRouterModelId: "x-ai/grok-4.20",
    label: "Grok 4.20",
    fallbackOpenRouterModelId: "anthropic/claude-sonnet-4.6",
    fallbackLabel: "Claude Sonnet 4.6",
  },
  /** Dual critics — different families reduce shared blind spots. */
  critics: [
    {
      provider: "wireline" as const,
      wirelineModel: CLAUDE_MODELS.SONNET,
      label: "Claude Sonnet 4.6",
      lens: "ux_hierarchy_mobile_a11y" as const,
    },
    {
      provider: "gemini" as const,
      geminiModel: GEMINI_MODELS.PRO_3_1,
      label: "Gemini 3.1 Pro",
      lens: "visual_distinctiveness_brand" as const,
    },
  ],
  /** Final reviewer — merges critics, approves or requests one builder revision. */
  finalReviewer: {
    provider: "wireline" as const,
    wirelineModel: CLAUDE_MODELS.OPUS,
    label: "Claude Opus 4.7",
  },
  /**
   * Creative consultants — optional brief enrichment. Not coders.
   * Perplexity Sonar: market/category signals. GPT-4o: moodboard language.
   * Disabled automatically when OPENROUTER_API_KEY is unset.
   */
  creativeConsultants: [
    {
      id: "market",
      provider: "openrouter" as const,
      openRouterModelId: "perplexity/sonar-pro",
      label: "Perplexity Sonar Pro",
      role: "market_signals" as const,
      enabled: true,
    },
    {
      id: "mood",
      provider: "openrouter" as const,
      openRouterModelId: "openai/gpt-4o",
      label: "GPT-4o",
      role: "visual_mood" as const,
      enabled: true,
    },
  ] satisfies DesignCreativeConsultant[],
  /**
   * Image models (Nano Banana / Gemini image) — hero reference only, not HTML.
   * Future: attach generated mood image to preview metadata. Off by default (cost).
   */
  imageReference: {
    enabled: false,
    openRouterModelId: "google/gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
  },
  maxRevisionRounds: 1,
  passScore: DESIGN_CRITIC_PASS_SCORE,
} as const;

export const WIRELINE_DESIGN_STUDIO_REASONING =
  "Wireline Design Studio — brief, build, dual critique, final review";

export function designTeamThinkingSummary(phases: string[]): string {
  return phases.filter(Boolean).join(" · ");
}
