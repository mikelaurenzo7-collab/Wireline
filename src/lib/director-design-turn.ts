/**
 * Wireline Design — brief gate + design.md before Spectrum Desk runs.
 */
import type { DirectorPreviewMeta } from "./director-message-metadata";
import {
  buildStitchClarifyReply,
  buildStitchDesignBriefArtifact,
  buildStitchDesignMarkdown,
  loadStitchTenantBranding,
  missingStitchBriefFields,
  parseStitchDesignBrief,
  resolveUseAccountBranding,
  stitchClarifyingQuestions,
  type StitchBriefOptions,
} from "./director-stitch-brief";
import { buildDesignProfileBriefExtras } from "./design-profile";
import { resolveStitchMediaOperation } from "./director-stitch-intent";

export interface DirectorDesignTurnResult {
  reply: string;
  previews: DirectorPreviewMeta[];
  artifacts: Array<Record<string, unknown>>;
  thinkingSummary: string;
  durationMs: number;
  clarifyingQuestions?: string[];
  designBriefMarkdown?: string;
}

export type DesignProgressCallback = (message: string) => void;

export interface DirectorDesignTurnInput {
  userId: string;
  operatorMessage: string;
  businessName?: string;
  history?: Array<{ role: "operator" | "director"; content: string }>;
  /** Composer/API field — Wireline Design mode + branding options. */
  stitchOptions?: StitchBriefOptions;
  onProgress?: DesignProgressCallback;
  signal?: AbortSignal;
}

export type DirectorDesignStudioInput = DirectorDesignTurnInput & {
  designBriefMarkdown: string;
};

/** @deprecated Use DirectorDesignTurnResult */
export type DirectorStitchTurnResult = DirectorDesignTurnResult;

/** @deprecated Use DirectorDesignTurnInput */
export type DirectorStitchTurnInput = DirectorDesignTurnInput;

/** @deprecated Use DesignProgressCallback */
export type StitchProgressCallback = DesignProgressCallback;

export type DesignPreparedTurn =
  | { phase: "clarify"; turn: DirectorDesignTurnResult }
  | {
      phase: "render";
      input: DirectorDesignTurnInput & { designBriefMarkdown: string; businessName?: string };
    };

/** Brief gate + design.md — runs before Spectrum Desk (no external design API). */
export async function prepareDirectorDesignTurn(
  input: DirectorDesignTurnInput,
): Promise<DesignPreparedTurn> {
  const t0 = Date.now();
  const branding = await loadStitchTenantBranding(input.userId);
  const useAccountBranding = resolveUseAccountBranding(input.stitchOptions, branding);
  const history = input.history ?? [];
  const operation = resolveStitchMediaOperation(input.operatorMessage, null);
  const brief = parseStitchDesignBrief(input.operatorMessage, history, branding);
  const profileExtras =
    input.stitchOptions?.designMode === true
      ? await buildDesignProfileBriefExtras(input.userId)
      : null;
  const designBriefMarkdown = buildStitchDesignMarkdown({
    brief,
    branding,
    useAccountBranding,
    designProfileSection: profileExtras?.profileSectionMarkdown,
  });
  const missing = missingStitchBriefFields(brief, operation, false, {
    designMode: input.stitchOptions?.designMode === true,
  });

  if (missing.length > 0) {
    const clarifyingQuestions = stitchClarifyingQuestions(missing);
    return {
      phase: "clarify",
      turn: {
        reply: buildStitchClarifyReply(missing, designBriefMarkdown, useAccountBranding),
        previews: [],
        artifacts: [buildStitchDesignBriefArtifact(designBriefMarkdown)],
        clarifyingQuestions,
        designBriefMarkdown,
        thinkingSummary: "Gathering design requirements",
        durationMs: Date.now() - t0,
      },
    };
  }

  const businessName =
    input.businessName?.trim() ||
    brief.businessName ||
    branding.businessName ||
    branding.brandName ||
    undefined;

  return {
    phase: "render",
    input: {
      ...input,
      businessName,
      designBriefMarkdown,
    },
  };
}

/** @deprecated Use prepareDirectorDesignTurn */
export const prepareStitchDirectorTurn = prepareDirectorDesignTurn;
