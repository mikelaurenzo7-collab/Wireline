/**
 * When Wireline Design (Stitch) cannot render, Claude delivers the same
 * design brief as an HTML/CSS prototype in chat.
 */
import { buildDirectorDeliverableGuidance, wantsStitchMediaRequest } from "./director-deliverables";
import {
  buildStitchDesignBriefArtifact,
  buildStitchDesignMarkdown,
  loadStitchTenantBranding,
  parseStitchDesignBrief,
  resolveUseAccountBranding,
  type StitchBriefOptions,
} from "./director-stitch-brief";
import { tryDirectorStitchTurn, type DirectorStitchTurnResult } from "./director-stitch-service";
import { isGoogleStitchConfigured } from "./google-stitch-config";
import { log } from "./server-context";
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
  | { kind: "stitch-failed"; turn: DirectorStitchTurnResult }
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

export async function buildStitchDesignLlmFallback(
  input: StitchDirectorPathInput,
): Promise<StitchDesignLlmFallback> {
  const ctx = await prepareStitchDesignBriefContext(input);
  return {
    ...ctx,
    deliverableGuidance: buildStitchChatDesignGuidance(
      input.operatorMessage,
      ctx.designBriefMarkdown,
    ),
  };
}

/** Try Stitch; on failure return LLM fallback context for the same design brief. */
export async function resolveStitchDirectorPath(
  input: StitchDirectorPathInput,
): Promise<StitchDirectorPathResult> {
  if (!wantsStitchMediaRequest(input.operatorMessage)) {
    return { kind: "none" };
  }

  const stitchTurn = await tryDirectorStitchTurn(input);
  if (stitchTurn) {
    return { kind: "stitch", turn: stitchTurn };
  }

  if (isGoogleStitchConfigured()) {
    log.info("director stitch render failed — returning operator fail copy", {
      userId: input.userId,
    });
    return {
      kind: "stitch-failed",
      turn: {
        reply: WIRELINE_STITCH_UI.failReply,
        previews: [],
        artifacts: [],
        thinkingSummary: WIRELINE_STITCH_UI.chatFallbackReasoning,
        durationMs: 0,
      },
    };
  }

  log.info("director stitch unavailable — falling back to chat design", {
    userId: input.userId,
  });
  const fallback = await buildStitchDesignLlmFallback(input);
  return { kind: "llm-fallback", fallback };
}

export const STITCH_DESIGN_LLM_MODEL_LABEL = WIRELINE_STITCH_UI.modelLabel;

export const STITCH_DESIGN_LLM_REASONING = WIRELINE_STITCH_UI.chatFallbackReasoning;
