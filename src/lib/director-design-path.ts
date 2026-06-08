/**
 * Wireline Design routing — Spectrum Desk LLM pipeline only.
 */
import { buildDirectorDeliverableGuidance } from "./director-deliverables";
import { runDirectorDesignStudio } from "./director-design-orchestrator";
import {
  prepareDirectorDesignTurn,
  type DirectorDesignTurnResult,
} from "./director-design-turn";
import {
  buildStitchDesignBriefArtifact,
  buildStitchDesignMarkdown,
  loadStitchTenantBranding,
  parseStitchDesignBrief,
  resolveUseAccountBranding,
  type StitchBriefOptions,
} from "./director-stitch-brief";
import { buildDesignProfileBriefExtras } from "./design-profile";
import { shouldRouteDirectorMessageToStitch } from "./director-stitch-intent";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

export interface DesignBriefContext {
  designBriefMarkdown: string;
  artifacts: Array<Record<string, unknown>>;
  useAccountBranding: boolean;
}

export interface DesignLlmFallback extends DesignBriefContext {
  deliverableGuidance: string;
}

export interface DesignDirectorPathInput {
  userId: string;
  operatorMessage: string;
  history: Array<{ role: "operator" | "director"; content: string }>;
  stitchOptions?: StitchBriefOptions;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

export type DesignDirectorPathResult =
  | { kind: "design"; turn: DirectorDesignTurnResult }
  | { kind: "llm-fallback"; fallback: DesignLlmFallback }
  | { kind: "none" };

const DESIGN_CHAT_FALLBACK_BLOCK = `## Wireline Design (chat mode — this turn)
The operator asked for a visual screen, UI mockup, or landing design. Spectrum Desk could not finish — deliver the same outcome in chat.

**Open \`reply\` with one short line:** Wireline Design couldn't finish the live pipeline — here's the same brief as an HTML prototype you can paste, ship, or hand to a developer.

Then structure the rest of \`reply\` as:
1. **Goals & audience** (2–4 bullets)
2. **Sitemap / screen scope** — pages or key sections and primary CTA
3. **Visual direction** — typography, color, spacing (honor design.md when provided)
4. **Starter prototype** — you MUST include exactly one \`\`\`html\`\`\` fenced block (mobile-first, semantic landmarks, accessible labels, single \`<style>\` block, realistic industry copy). Keep it under ~150 lines.
5. **Handoff** — what to tweak next in chat (hero, palette, extra pages)

Do not refuse as out-of-scope. Do not route to logo tools unless they explicitly asked for a logo.`;

export function buildDesignChatGuidance(
  operatorMessage: string,
  designBriefMarkdown: string,
): string {
  return [
    buildDirectorDeliverableGuidance(operatorMessage),
    DESIGN_CHAT_FALLBACK_BLOCK,
    "## design.md (follow this brief)",
    designBriefMarkdown.trim(),
  ].join("\n\n");
}

export async function prepareDesignBriefContext(input: {
  userId: string;
  operatorMessage: string;
  history?: Array<{ role: "operator" | "director"; content: string }>;
  stitchOptions?: StitchBriefOptions;
}): Promise<DesignBriefContext> {
  const branding = await loadStitchTenantBranding(input.userId);
  const useAccountBranding = resolveUseAccountBranding(input.stitchOptions, branding);
  const history = input.history ?? [];
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

  return {
    designBriefMarkdown,
    artifacts: [buildStitchDesignBriefArtifact(designBriefMarkdown)],
    useAccountBranding,
  };
}

export async function buildDesignLlmFallback(
  input: DesignDirectorPathInput,
  reason?: string,
): Promise<DesignLlmFallback> {
  const ctx = await prepareDesignBriefContext(input);
  const failureNote = reason
    ? `## Wireline Design pipeline\n${reason}\nDeliver the HTML prototype from design.md.`
    : "## Wireline Design pipeline\nSpectrum Desk unavailable — still ship the HTML prototype in chat.";
  const deliverableGuidance = [
    buildDesignChatGuidance(input.operatorMessage, ctx.designBriefMarkdown),
    failureNote,
  ].join("\n\n");
  return { ...ctx, deliverableGuidance };
}

/** Design mode → clarify or Spectrum Desk; on failure Opus drafts HTML in chat. */
export async function resolveDesignDirectorPath(
  input: DesignDirectorPathInput,
): Promise<DesignDirectorPathResult> {
  if (
    !shouldRouteDirectorMessageToStitch(input.operatorMessage, {
      stitchOptions: input.stitchOptions,
      history: input.history,
    })
  ) {
    return { kind: "none" };
  }

  const prepared = await prepareDirectorDesignTurn(input);

  if (prepared.phase === "clarify") {
    return { kind: "design", turn: prepared.turn };
  }

  try {
    const turn = await runDirectorDesignStudio({
      ...prepared.input,
      onProgress: input.onProgress,
      signal: input.signal,
    });
    return { kind: "design", turn };
  } catch (e) {
    log.error("design studio failed — falling back to chat design", {
      userId: input.userId,
      error: getErrorMessage(e),
    });
    const fallback = await buildDesignLlmFallback(input, getErrorMessage(e));
    return { kind: "llm-fallback", fallback };
  }
}

export const DESIGN_LLM_MODEL_LABEL = WIRELINE_STITCH_UI.modelLabel;
export const DESIGN_LLM_REASONING = WIRELINE_STITCH_UI.chatFallbackReasoning;

/** @deprecated Use DesignDirectorPathResult */
export type StitchDirectorPathResult =
  | { kind: "design"; turn: DirectorDesignTurnResult }
  | { kind: "llm-fallback"; fallback: DesignLlmFallback }
  | { kind: "none" };

/** @deprecated Use DesignBriefContext */
export type StitchDesignBriefContext = DesignBriefContext;

/** @deprecated Use DesignLlmFallback */
export type StitchDesignLlmFallback = DesignLlmFallback;

/** @deprecated Use DesignDirectorPathInput */
export type StitchDirectorPathInput = DesignDirectorPathInput;

/** @deprecated Use buildDesignChatGuidance */
export const buildStitchChatDesignGuidance = buildDesignChatGuidance;

/** @deprecated Use prepareDesignBriefContext */
export const prepareStitchDesignBriefContext = prepareDesignBriefContext;

/** @deprecated Use buildDesignLlmFallback */
export const buildStitchDesignLlmFallback = buildDesignLlmFallback;

/** @deprecated Use DESIGN_LLM_MODEL_LABEL */
export const STITCH_DESIGN_LLM_MODEL_LABEL = DESIGN_LLM_MODEL_LABEL;

/** @deprecated Use DESIGN_LLM_REASONING */
export const STITCH_DESIGN_LLM_REASONING = DESIGN_LLM_REASONING;

/** @deprecated Use resolveDesignDirectorPath */
export const resolveStitchDirectorPath = resolveDesignDirectorPath;
