/**
 * Wireline Design Studio — multi-model pipeline for Design mode.
 * Creative consultants enrich the brief; one builder writes HTML; critics score; Opus ships.
 */
import { CLAUDE_MODELS } from "./claude-models";
import { runCompletion, runStructured } from "./claude-structured";
import {
  buildCreativeConsultantPrompt,
  buildDesignBuilderUserPrompt,
  DESIGN_BUILDER_SYSTEM,
  DESIGN_CRITIC_GEMINI_SYSTEM,
  DESIGN_CRITIC_SONNET_SYSTEM,
  DESIGN_CRITIC_TOOL,
  DESIGN_FINAL_REVIEWER_SYSTEM,
  DESIGN_FINAL_REVIEW_TOOL,
} from "./director-design-prompts";
import {
  designTeamThinkingSummary,
  WIRELINE_DESIGN_STUDIO_REASONING,
  WIRELINE_DESIGN_TEAM,
} from "./director-design-team";
import { extractDirectorHtmlPrototype, packageDirectorHtmlPrototypePreview } from "./director-html-prototype";
import { buildStitchDesignBriefArtifact } from "./director-stitch-brief";
import type { DirectorStitchTurnInput, DirectorStitchTurnResult } from "./director-stitch-service";
import type { StitchProgressCallback } from "./director-stitch-service";
import { runGeminiJsonCompletion } from "./gemini-brain";
import { isOpenRouterConfigured, runOpenRouterCompletion } from "./openrouter-structured";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

export interface DesignCritiqueScores {
  overall: number;
  hierarchy: number;
  mobile: number;
  accessibility: number;
  distinctiveness: number;
  industry_fit: number;
  strengths?: string[];
  issues: string[];
}

interface DesignFinalReview {
  decision: "approve" | "revise";
  revisionNotes?: string;
  operatorReply: string;
  pageTitle: string;
}

function stripHtmlFences(raw: string): string {
  const extracted = extractDirectorHtmlPrototype(raw);
  if (extracted) return extracted;
  return raw
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function critiquePasses(scores: DesignCritiqueScores, min: number): boolean {
  return (
    scores.overall >= min &&
    scores.hierarchy >= min &&
    scores.mobile >= min &&
    scores.accessibility >= min &&
    scores.distinctiveness >= min &&
    scores.industry_fit >= min
  );
}

async function runCreativeConsultants(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (!isOpenRouterConfigured()) return "";

  const enabled = WIRELINE_DESIGN_TEAM.creativeConsultants.filter((c) => c.enabled);
  const results = await Promise.all(
    enabled.map(async (consultant) => {
      const { system, user } = buildCreativeConsultantPrompt(
        consultant,
        input.operatorMessage,
        input.designBriefMarkdown,
      );
      try {
        const text = await runOpenRouterCompletion({
          model: consultant.openRouterModelId!,
          system,
          user,
          maxTokens: 512,
          signal: input.signal,
        });
        return `### ${consultant.label}\n${text.trim()}`;
      } catch (e) {
        log.warn("design studio creative consultant skipped", {
          consultant: consultant.id,
          error: getErrorMessage(e),
        });
        return "";
      }
    }),
  );

  return results.filter(Boolean).join("\n\n");
}

async function runDesignBuilder(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  creativeNotes?: string;
  revisionNotes?: string;
  priorHtml?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const user = buildDesignBuilderUserPrompt(input);

  if (isOpenRouterConfigured()) {
    try {
      const raw = await runOpenRouterCompletion({
        model: WIRELINE_DESIGN_TEAM.builder.openRouterModelId,
        system: DESIGN_BUILDER_SYSTEM,
        user,
        maxTokens: 8192,
        signal: input.signal,
      });
      return stripHtmlFences(raw);
    } catch (e) {
      log.warn("design studio builder fallback to Sonnet", {
        error: getErrorMessage(e),
      });
    }
  }

  const { text } = await runCompletion({
    model: CLAUDE_MODELS.SONNET,
    system: DESIGN_BUILDER_SYSTEM,
    user,
    maxTokens: 8192,
  });
  return stripHtmlFences(text);
}

async function runSonnetCritic(input: {
  html: string;
  operatorMessage: string;
  signal?: AbortSignal;
}): Promise<DesignCritiqueScores> {
  return runStructured<DesignCritiqueScores>({
    model: WIRELINE_DESIGN_TEAM.critics[0].wirelineModel,
    system: DESIGN_CRITIC_SONNET_SYSTEM,
    user: `Operator request:\n${input.operatorMessage}\n\n## HTML\n${input.html.slice(0, 20_000)}`,
    tool: DESIGN_CRITIC_TOOL,
    maxTokens: 2048,
    signal: input.signal,
  });
}

async function runGeminiCritic(input: {
  html: string;
  operatorMessage: string;
  signal?: AbortSignal;
}): Promise<DesignCritiqueScores | null> {
  const geminiModel = WIRELINE_DESIGN_TEAM.critics[1].geminiModel;
  if (!geminiModel) return null;
  try {
    return await runGeminiJsonCompletion<DesignCritiqueScores>({
      model: geminiModel,
      system: DESIGN_CRITIC_GEMINI_SYSTEM,
      user: `Operator request:\n${input.operatorMessage}\n\nReturn JSON with keys: overall, hierarchy, mobile, accessibility, distinctiveness, industry_fit, strengths (array), issues (array). Scores are 1-10.\n\n## HTML\n${input.html.slice(0, 20_000)}`,
      signal: input.signal,
    });
  } catch (e) {
    log.warn("design studio gemini critic skipped", { error: getErrorMessage(e) });
    return null;
  }
}

async function runFinalReview(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  sonnetCritique: DesignCritiqueScores;
  geminiCritique: DesignCritiqueScores | null;
  signal?: AbortSignal;
}): Promise<DesignFinalReview> {
  const criticBlock = [
    "## Sonnet critique",
    JSON.stringify(input.sonnetCritique, null, 2),
    input.geminiCritique ? "## Gemini critique\n" + JSON.stringify(input.geminiCritique, null, 2) : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return runStructured<DesignFinalReview>({
    model: WIRELINE_DESIGN_TEAM.finalReviewer.wirelineModel,
    system: DESIGN_FINAL_REVIEWER_SYSTEM,
    user: [
      `Operator request:\n${input.operatorMessage}`,
      `## design.md\n${input.designBriefMarkdown.slice(0, 4000)}`,
      criticBlock,
      `## HTML\n${input.html.slice(0, 16_000)}`,
    ].join("\n\n"),
    tool: DESIGN_FINAL_REVIEW_TOOL,
    maxTokens: 4096,
    signal: input.signal,
  });
}

function buildFallbackOperatorReply(pageTitle: string): string {
  return [
    `Your **${pageTitle}** is ready — open the live preview to see it on your phone or desktop.`,
    "",
    "- Hero, headline, and primary call-to-action are in place",
    "- Typography and colors follow your brief",
    "- You can ask me to tweak copy, palette, or add sections in chat",
  ].join("\n");
}

/** Run the full Design Studio pipeline and return a stitch-shaped Director turn. */
export async function runDirectorDesignStudio(
  input: DirectorStitchTurnInput & { designBriefMarkdown: string },
): Promise<DirectorStitchTurnResult> {
  const t0 = Date.now();
  const phases: string[] = [];
  const onProgress: StitchProgressCallback | undefined = input.onProgress;
  const studioPhases = WIRELINE_STITCH_UI.studioLoadingPhases;

  onProgress?.(studioPhases[0] ?? "Gathering creative direction…");
  phases.push("Creative brief");
  const creativeNotes = await runCreativeConsultants({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    signal: input.signal,
  });

  onProgress?.(studioPhases[1] ?? "Building your page…");
  phases.push("Build");
  let html = await runDesignBuilder({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    creativeNotes: creativeNotes || undefined,
    signal: input.signal,
  });

  onProgress?.(studioPhases[2] ?? "Reviewing layout…");
  phases.push("Dual critique");
  const [sonnetCritique, geminiCritique] = await Promise.all([
    runSonnetCritic({
      html,
      operatorMessage: input.operatorMessage,
      signal: input.signal,
    }),
    runGeminiCritic({
      html,
      operatorMessage: input.operatorMessage,
      signal: input.signal,
    }),
  ]);

  const criticsPass =
    critiquePasses(sonnetCritique, WIRELINE_DESIGN_TEAM.passScore) &&
    (!geminiCritique || critiquePasses(geminiCritique, WIRELINE_DESIGN_TEAM.passScore));

  onProgress?.(studioPhases[3] ?? "Final polish…");
  phases.push("Final review");
  let finalReview: DesignFinalReview;
  try {
    finalReview = await runFinalReview({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      html,
      sonnetCritique,
      geminiCritique,
      signal: input.signal,
    });
  } catch (e) {
    log.warn("design studio final review fallback", { error: getErrorMessage(e) });
    finalReview = {
      decision: criticsPass ? "approve" : "revise",
      revisionNotes: [...sonnetCritique.issues, ...(geminiCritique?.issues ?? [])]
        .slice(0, 6)
        .map((issue) => `- ${issue}`)
        .join("\n"),
      operatorReply: "",
      pageTitle: input.operatorMessage.trim().slice(0, 72) || "Your page",
    };
  }

  if (
    finalReview.decision === "revise" &&
    finalReview.revisionNotes?.trim() &&
    WIRELINE_DESIGN_TEAM.maxRevisionRounds > 0
  ) {
    phases.push("Revision");
    onProgress?.("Applying refinements…");
    html = await runDesignBuilder({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      creativeNotes: creativeNotes || undefined,
      revisionNotes: finalReview.revisionNotes,
      priorHtml: html,
      signal: input.signal,
    });
  }

  const pageTitle = finalReview.pageTitle?.trim() || "Your page";
  const operatorReply =
    finalReview.operatorReply?.trim() || buildFallbackOperatorReply(pageTitle);

  const packaged = await packageDirectorHtmlPrototypePreview({
    userId: input.userId,
    operatorMessage: input.operatorMessage,
    html,
    title: pageTitle,
  });

  const briefArtifact = buildStitchDesignBriefArtifact(input.designBriefMarkdown);

  return {
    reply: operatorReply,
    previews: [packaged.preview],
    artifacts: [briefArtifact, ...packaged.artifacts],
    designBriefMarkdown: input.designBriefMarkdown,
    thinkingSummary: designTeamThinkingSummary(phases) || WIRELINE_DESIGN_STUDIO_REASONING,
    durationMs: Date.now() - t0,
  };
}
