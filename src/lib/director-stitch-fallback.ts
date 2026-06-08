/**
 * When Wireline Design (Stitch) cannot render, Claude delivers the same
 * design brief as an HTML/CSS prototype in chat.
 */
import { buildDirectorDeliverableGuidance } from "./director-deliverables";
import { shouldRouteDirectorMessageToStitch } from "./director-stitch-intent";
import { loadLatestStitchSession } from "./director-stitch-session";
import {
  buildStitchDesignBriefArtifact,
  buildStitchDesignMarkdown,
  loadStitchTenantBranding,
  parseStitchDesignBrief,
  resolveUseAccountBranding,
  type StitchBriefOptions,
} from "./director-stitch-brief";
import { runDirectorDesignStudio } from "./director-design-orchestrator";
import { isStitchDesignModeActive } from "./director-stitch-intent";
import {
  prepareStitchDirectorTurn,
  tryDirectorStitchTurn,
  type DirectorStitchTurnAttempt,
  type DirectorStitchTurnResult,
} from "./director-stitch-service";
import { GoogleStitchError } from "./google-stitch-mcp-client";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

export interface StitchDesignBriefContext {
  designBriefMarkdown: string;
  artifacts: Array<Record<string, unknown>>;
  useAccountBranding: boolean;
}

export interface StitchDesignLlmFallback extends StitchDesignBriefContext {
  deliverableGuidance: string;
}

export interface StitchDirectorPathInput {
  userId: string;
  operatorMessage: string;
  history: Array<{ role: "operator" | "director"; content: string }>;
  stitchOptions?: StitchBriefOptions;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

export type StitchDirectorPathResult =
  | { kind: "stitch"; turn: DirectorStitchTurnResult }
  | { kind: "llm-fallback"; fallback: StitchDesignLlmFallback }
  | { kind: "none" };

const STITCH_CHAT_DESIGN_BLOCK = `## Wireline Design (chat mode — this turn)
The operator asked for a visual screen, UI mockup, or landing design. Live pixel rendering is unavailable — you deliver the same outcome in chat.

**Open \`reply\` with one short line:** Wireline Design couldn't finish the live render — here's the same brief as an HTML prototype you can paste, ship, or hand to a developer.

Then structure the rest of \`reply\` as:
1. **Goals & audience** (2–4 bullets)
2. **Sitemap / screen scope** — pages or key sections and primary CTA
3. **Visual direction** — typography, color, spacing (honor design.md when provided)
4. **Starter prototype** — you MUST include exactly one \`\`\`html\`\`\` fenced block (mobile-first, semantic landmarks, accessible labels, single \`<style>\` block, realistic industry copy). Keep it under ~150 lines.
5. **Handoff** — what to tweak next in chat (hero, palette, extra pages)

Do not refuse as out-of-scope. Do not route to logo tools unless they explicitly asked for a logo.`;

export function buildStitchChatDesignGuidance(
  operatorMessage: string,
  designBriefMarkdown: string,
): string {
  return [
    buildDirectorDeliverableGuidance(operatorMessage),
    STITCH_CHAT_DESIGN_BLOCK,
    "## design.md (follow this brief)",
    designBriefMarkdown.trim(),
  ].join("\n\n");
}

export async function prepareStitchDesignBriefContext(input: {
  userId: string;
  operatorMessage: string;
  history?: Array<{ role: "operator" | "director"; content: string }>;
  stitchOptions?: StitchBriefOptions;
}): Promise<StitchDesignBriefContext> {
  const branding = await loadStitchTenantBranding(input.userId);
  const useAccountBranding = resolveUseAccountBranding(input.stitchOptions, branding);
  const history = input.history ?? [];
  const brief = parseStitchDesignBrief(input.operatorMessage, history, branding);
  const designBriefMarkdown = buildStitchDesignMarkdown({
    brief,
    branding,
    useAccountBranding,
  });

  return {
    designBriefMarkdown,
    artifacts: [buildStitchDesignBriefArtifact(designBriefMarkdown)],
    useAccountBranding,
  };
}

function buildStitchFailureGuidanceNote(error?: GoogleStitchError): string {
  if (!error) {
    return "## Stitch live render\nLive pixel rendering is unavailable on this workspace — still ship the HTML prototype in chat.";
  }
  if (error.code === "AUTH_FAILED") {
    return [
      "## Stitch live render",
      "Credentials or project configuration blocked the live render.",
      "Open `reply` with one line that live Wireline Design could not finish — then deliver the same brief as an HTML prototype (do not stop at an error-only message).",
      "Mention that an admin should verify GOOGLE_STITCH_API_KEY and GOOGLE_STITCH_PROJECT_ID if they want live previews again.",
    ].join("\n");
  }
  if (error.code === "VALIDATION_ERROR") {
    return [
      "## Stitch live render",
      "The Stitch project or request was rejected before a screen could render.",
      "Open `reply` with one line that live Wireline Design could not finish — then deliver the HTML prototype from design.md.",
    ].join("\n");
  }
  return [
    "## Stitch live render",
    "The live render did not finish (timeout, transport, or packaging).",
    "Open `reply` with one line that live Wireline Design could not finish — then deliver the HTML prototype from design.md.",
  ].join("\n");
}

export async function buildStitchDesignLlmFallback(
  input: StitchDirectorPathInput,
  failure?: GoogleStitchError,
): Promise<StitchDesignLlmFallback> {
  const ctx = await prepareStitchDesignBriefContext(input);
  const deliverableGuidance = [
    buildStitchChatDesignGuidance(input.operatorMessage, ctx.designBriefMarkdown),
    buildStitchFailureGuidanceNote(failure),
  ].join("\n\n");
  return {
    ...ctx,
    deliverableGuidance,
  };
}

async function buildLlmFallbackResult(
  input: StitchDirectorPathInput,
  stitchAttempt: Exclude<DirectorStitchTurnAttempt, { kind: "turn" }>,
): Promise<Extract<StitchDirectorPathResult, { kind: "llm-fallback" }>> {
  const failure =
    stitchAttempt.kind === "hard-failure" || stitchAttempt.kind === "recoverable-failure"
      ? stitchAttempt.error
      : undefined;
  const fallback = await buildStitchDesignLlmFallback(input, failure);
  return { kind: "llm-fallback", fallback };
}

function shouldUseDesignStudio(stitchOptions?: StitchBriefOptions): boolean {
  return (
    isStitchDesignModeActive(stitchOptions) && stitchOptions?.useStitchPixelRender !== true
  );
}

/** Design Studio (default) or Stitch pixel render; on failure Opus drafts HTML in chat. */
export async function resolveStitchDirectorPath(
  input: StitchDirectorPathInput,
): Promise<StitchDirectorPathResult> {
  const stitchSession = await loadLatestStitchSession(input.userId);
  if (
    !shouldRouteDirectorMessageToStitch(input.operatorMessage, {
      stitchOptions: input.stitchOptions,
      history: input.history,
      stitchSession,
    })
  ) {
    return { kind: "none" };
  }

  if (shouldUseDesignStudio(input.stitchOptions)) {
    const prepared = await prepareStitchDirectorTurn(input);
    if (prepared.phase === "clarify") {
      return { kind: "stitch", turn: prepared.turn };
    }
    try {
      const turn = await runDirectorDesignStudio({
        ...prepared.input,
        onProgress: input.onProgress,
        signal: input.signal,
      });
      return { kind: "stitch", turn };
    } catch (e) {
      log.error("design studio failed — falling back to chat design", {
        userId: input.userId,
        error: getErrorMessage(e),
      });
      return buildLlmFallbackResult(input, {
        kind: "recoverable-failure",
        error: new GoogleStitchError(
          getErrorMessage(e),
          "TOOL_ERROR",
          true,
        ),
      });
    }
  }

  const stitchAttempt = await tryDirectorStitchTurn(input);

  if (stitchAttempt.kind === "turn") {
    return { kind: "stitch", turn: stitchAttempt.turn };
  }

  log.info("director stitch unavailable — falling back to chat design", {
    userId: input.userId,
    attemptKind: stitchAttempt.kind,
    code:
      stitchAttempt.kind === "hard-failure" || stitchAttempt.kind === "recoverable-failure"
        ? stitchAttempt.error.code
        : undefined,
  });
  return buildLlmFallbackResult(input, stitchAttempt);
}

export const STITCH_DESIGN_LLM_MODEL_LABEL = WIRELINE_STITCH_UI.modelLabel;

export const STITCH_DESIGN_LLM_REASONING = WIRELINE_STITCH_UI.chatFallbackReasoning;
