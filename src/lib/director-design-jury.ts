/**
 * Spectrum Desk jury — deterministic scoring; Sonnet/GLM text tie-break only when close.
 * Used for optional Hy3 challenger vs Qwen primary (not a multi-architect tournament).
 */
import type { DesignPassNumber } from "./director-design-team";
import {
  pickWinningArchitectCandidate,
  rankArchitectCandidates,
  type DesignArchitectCandidateResult,
} from "./director-design-ensemble";
import { isOpenRouterConfigured, runOpenRouterStructured } from "./openrouter-structured";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/** Score gap below this triggers a GLM jury tie-break (HTML-only, no screenshots). */
export const JURY_TIEBREAK_SCORE_GAP = 8;

export interface DesignJuryVerdict {
  winner: DesignArchitectCandidateResult;
  ranked: DesignArchitectCandidateResult[];
  reasoning: string;
  usedGlmTiebreak: boolean;
}

const DESIGN_JURY_TIEBREAK_SYSTEM = `You are the Spectrum Desk design jury tie-breaker.
Two HTML landing-page drafts scored nearly equal on deterministic checks.
Pick the winner for a US local-business audience.

Prefer: clear hero hierarchy, real button CTAs, trust signals, distinctive (non-template) layout, kit class usage.
Return your choice via the tool only.`;

const DESIGN_JURY_TIEBREAK_TOOL = {
  name: "wireline_design_jury_pick",
  description: "Pick winning architect draft in a close vote",
  input_schema: {
    type: "object" as const,
    properties: {
      winnerId: { type: "string", description: "architectId of the winning draft" },
      reasoning: {
        type: "string",
        description: "One sentence why this draft wins for the US operator",
      },
    },
    required: ["winnerId", "reasoning"],
  },
};

function buildTiebreakUserPrompt(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  passNumber: DesignPassNumber;
  ranked: DesignArchitectCandidateResult[];
}): string {
  const top = input.ranked.slice(0, 3);
  const blocks = top.map((c, i) => {
    return [
      `### Candidate ${i + 1}: ${c.label} (id=${c.architectId}, score=${c.voteScore})`,
      c.qualityIssues.length ? `Issues: ${c.qualityIssues.join("; ")}` : "Issues: none flagged",
      "```html",
      c.html.slice(0, 10_000),
      "```",
    ].join("\n");
  });
  return [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## Pass ${input.passNumber} close vote`,
    `## design.md (excerpt)\n${input.designBriefMarkdown.slice(0, 2000)}`,
    "## Candidates (pick winnerId)",
    ...blocks,
  ].join("\n\n");
}

export function formatJuryVerdictSummary(verdict: DesignJuryVerdict): string {
  const podium = verdict.ranked
    .slice(0, 3)
    .map((r) => `${r.label} ${r.voteScore}`)
    .join(" · ");
  return `Vote → ${verdict.winner.label} (${verdict.winner.voteScore}): ${verdict.reasoning} [${podium}]`;
}

/** Rank candidates and optionally break ties with GLM (HTML critique, not screenshots). */
export async function resolveArchitectJury(input: {
  entries: Array<{ architectId: string; label: string; html: string }>;
  operatorMessage: string;
  designBriefMarkdown: string;
  passNumber: DesignPassNumber;
  glmCriticModelId: string;
  signal?: AbortSignal;
}): Promise<DesignJuryVerdict> {
  const ranked = rankArchitectCandidates(input.entries);
  const winner = pickWinningArchitectCandidate(ranked);
  if (!winner) {
    throw new Error("Spectrum jury: no architect candidates to rank");
  }

  if (ranked.length < 2) {
    return {
      winner,
      ranked,
      reasoning: "Only one draft completed",
      usedGlmTiebreak: false,
    };
  }

  const runnerUp = ranked[1]!;
  const gap = winner.voteScore - runnerUp.voteScore;

  if (gap >= JURY_TIEBREAK_SCORE_GAP) {
    return {
      winner,
      ranked,
      reasoning: `Deterministic jury (+${gap} over ${runnerUp.label})`,
      usedGlmTiebreak: false,
    };
  }

  if (!isOpenRouterConfigured()) {
    return {
      winner,
      ranked,
      reasoning: `Close vote (+${gap}); OpenRouter off — kept top score`,
      usedGlmTiebreak: false,
    };
  }

  try {
    const { result } = await runOpenRouterStructured<{ winnerId: string; reasoning: string }>({
      model: input.glmCriticModelId,
      system: DESIGN_JURY_TIEBREAK_SYSTEM,
      user: buildTiebreakUserPrompt({
        operatorMessage: input.operatorMessage,
        designBriefMarkdown: input.designBriefMarkdown,
        passNumber: input.passNumber,
        ranked,
      }),
      tool: DESIGN_JURY_TIEBREAK_TOOL,
      maxTokens: 512,
      signal: input.signal,
    });

    const picked =
      ranked.find((r) => r.architectId === result.winnerId) ??
      ranked.find((r) => r.architectId.toLowerCase() === result.winnerId.toLowerCase()) ??
      winner;

    return {
      winner: picked,
      ranked,
      reasoning: result.reasoning?.trim() || `GLM tie-break (+${gap} gap)`,
      usedGlmTiebreak: true,
    };
  } catch (e) {
    log.warn("design studio GLM jury tie-break skipped", { error: getErrorMessage(e) });
    return {
      winner,
      ranked,
      reasoning: `Close vote (+${gap}); GLM tie-break failed — kept top score`,
      usedGlmTiebreak: false,
    };
  }
}
