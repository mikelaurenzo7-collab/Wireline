/**
 * Wireline Design Studio — Opus research → Grok build → Gemini refine → Opus code review
 * (2–3 evolving passes) → Stitch-quality gate → Opus approval.
 */
import { CLAUDE_MODELS } from "./claude-models";
import {
  buildDesignBuilderUserPrompt,
  buildGeminiVisualUserPrompt,
  DESIGN_BUILDER_SYSTEM,
  DESIGN_CODE_REVIEWER_SYSTEM,
  DESIGN_CODE_REVIEW_TOOL,
  DESIGN_EMERGENCY_POLISH_SYSTEM,
  DESIGN_FINAL_APPROVAL_TOOL,
  DESIGN_FINAL_APPROVER_SYSTEM,
  DESIGN_GEMINI_VISUAL_SYSTEM,
  DESIGN_RESEARCH_SYSTEM,
} from "./director-design-prompts";
import {
  formatImagineAssetsForBuilder,
  generateDesignImagineAssets,
  injectImagineAssetsIntoHtml,
  type DesignImagineAsset,
} from "./director-design-imagine";
import {
  assessDesignStudioHtmlQuality,
  designQualityPasses,
  formatDesignQualityRevisionNotes,
} from "./director-design-quality";
import {
  designStudioProgressLabel,
  designTeamThinkingSummary,
  type DesignPassNumber,
  WIRELINE_DESIGN_STUDIO_REASONING,
  WIRELINE_DESIGN_TEAM,
} from "./director-design-team";
import {
  extractDirectorHtmlPrototype,
  packageDirectorHtmlPrototypePreview,
  resolveDesignPreviewDeviceType,
} from "./director-html-prototype";
import { buildStitchDesignBriefArtifact } from "./director-stitch-brief";
import type { DirectorStitchTurnInput, DirectorStitchTurnResult } from "./director-stitch-service";
import type { StitchProgressCallback } from "./director-stitch-service";
import { runGeminiTextCompletion } from "./gemini-brain";
import { runCompletion, runStructured } from "./claude-structured";
import { isOpenRouterConfigured, runOpenRouterCompletion } from "./openrouter-structured";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

export interface DesignCodeReviewResult {
  decision: "approve" | "revise";
  overall: number;
  structure: number;
  components: number;
  visual_polish: number;
  mobile: number;
  accessibility: number;
  strengths?: string[];
  issues: string[];
  revisionNotes?: string;
}

interface DesignFinalApproval {
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

function codeReviewPasses(review: DesignCodeReviewResult, min: number): boolean {
  return (
    review.decision === "approve" &&
    review.overall >= min &&
    review.structure >= min &&
    review.components >= min &&
    review.visual_polish >= min &&
    review.mobile >= min &&
    review.accessibility >= min
  );
}

function mergeRevisionNotes(...blocks: Array<string | undefined>): string {
  return blocks.filter(Boolean).join("\n\n").trim();
}

async function runDesignResearch(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { text } = await runCompletion({
    model: WIRELINE_DESIGN_TEAM.researcher.wirelineModel,
    system: DESIGN_RESEARCH_SYSTEM,
    user: [
      `Operator request:\n${input.operatorMessage.trim()}`,
      `## design.md\n${input.designBriefMarkdown.trim().slice(0, 6000)}`,
    ].join("\n\n"),
    maxTokens: 2048,
    signal: input.signal,
  });
  return text.trim();
}

async function runDesignBuilder(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  researchNotes?: string;
  imagineAssetsNotes?: string;
  revisionNotes?: string;
  priorHtml?: string;
  passNumber: DesignPassNumber;
  signal?: AbortSignal;
}): Promise<string> {
  const user = buildDesignBuilderUserPrompt(input);

  if (isOpenRouterConfigured()) {
    try {
      const raw = await runOpenRouterCompletion({
        model: WIRELINE_DESIGN_TEAM.builder.openRouterModelId,
        system: DESIGN_BUILDER_SYSTEM,
        user,
        maxTokens: 12_288,
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
    maxTokens: 12_288,
    signal: input.signal,
  });
  return stripHtmlFences(text);
}

async function runGeminiVisualRefine(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
  revisionNotes?: string;
  imagineAssetsNotes?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const geminiModel = WIRELINE_DESIGN_TEAM.visualRefiner.geminiModel;
  if (!geminiModel) return input.html;

  try {
    const raw = await runGeminiTextCompletion({
      model: geminiModel,
      system: DESIGN_GEMINI_VISUAL_SYSTEM,
      user: buildGeminiVisualUserPrompt(input),
      signal: input.signal,
    });
    return stripHtmlFences(raw);
  } catch (e) {
    log.warn("design studio gemini visual refine skipped", { error: getErrorMessage(e) });
    return input.html;
  }
}

async function runCodeReview(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passNumber: DesignPassNumber;
  signal?: AbortSignal;
}): Promise<DesignCodeReviewResult> {
  const quality = assessDesignStudioHtmlQuality(input.html);
  const qualityBlock = formatDesignQualityRevisionNotes(quality);

  const review = await runStructured<DesignCodeReviewResult>({
    model: WIRELINE_DESIGN_TEAM.codeReviewer.wirelineModel,
    system: DESIGN_CODE_REVIEWER_SYSTEM,
    user: [
      `Operator request:\n${input.operatorMessage}`,
      `## Pass ${input.passNumber} of ${WIRELINE_DESIGN_TEAM.maxRefinementPasses}`,
      `## design.md (excerpt)\n${input.designBriefMarkdown.slice(0, 3000)}`,
      qualityBlock ? `## Automated Stitch-quality checks failed\n${qualityBlock}` : "",
      `## HTML\n${input.html.slice(0, 20_000)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    tool: DESIGN_CODE_REVIEW_TOOL,
    maxTokens: 3072,
    signal: input.signal,
  });

  if (!designQualityPasses(quality) && review.decision === "approve") {
    return {
      ...review,
      decision: "revise",
      revisionNotes: mergeRevisionNotes(review.revisionNotes, qualityBlock),
    };
  }

  return review;
}

async function runEmergencyPolish(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  qualityIssues: string;
  signal?: AbortSignal;
}): Promise<string> {
  const user = [
    `Operator request:\n${input.operatorMessage}`,
    `## design.md\n${input.designBriefMarkdown.slice(0, 4000)}`,
    `## Quality failures to fix\n${input.qualityIssues}`,
    `## HTML\n${input.html.slice(0, 24_000)}`,
  ].join("\n\n");

  if (isOpenRouterConfigured()) {
    try {
      const raw = await runOpenRouterCompletion({
        model: WIRELINE_DESIGN_TEAM.builder.openRouterModelId,
        system: DESIGN_EMERGENCY_POLISH_SYSTEM,
        user,
        maxTokens: 12_288,
        signal: input.signal,
      });
      return stripHtmlFences(raw);
    } catch (e) {
      log.warn("design studio emergency polish openrouter failed", { error: getErrorMessage(e) });
    }
  }

  const { text } = await runCompletion({
    model: CLAUDE_MODELS.SONNET,
    system: DESIGN_EMERGENCY_POLISH_SYSTEM,
    user,
    maxTokens: 12_288,
    signal: input.signal,
  });
  return stripHtmlFences(text);
}

async function runFinalApproval(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passCount: number;
  signal?: AbortSignal;
}): Promise<DesignFinalApproval> {
  return runStructured<DesignFinalApproval>({
    model: WIRELINE_DESIGN_TEAM.finalApprover.wirelineModel,
    system: DESIGN_FINAL_APPROVER_SYSTEM,
    user: [
      `Operator request:\n${input.operatorMessage}`,
      `Completed ${input.passCount} refinement passes.`,
      `## design.md (excerpt)\n${input.designBriefMarkdown.slice(0, 3000)}`,
      `## HTML (excerpt)\n${input.html.slice(0, 12_000)}`,
    ].join("\n\n"),
    tool: DESIGN_FINAL_APPROVAL_TOOL,
    maxTokens: 2048,
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
  let phaseCursor = 0;
  const nextStudioPhase = () => studioPhases[phaseCursor++] ?? studioPhases.at(-1)!;

  onProgress?.(nextStudioPhase());
  phases.push("Opus research");
  const researchNotes = await runDesignResearch({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    signal: input.signal,
  });

  const previewDeviceType = resolveDesignPreviewDeviceType({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
  });

  onProgress?.("Generating hero photography with Grok Imagine…");
  phases.push("Grok Imagine");
  let imagineAssets: DesignImagineAsset[] = [];
  try {
    imagineAssets = await generateDesignImagineAssets({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      researchNotes,
      deviceType: previewDeviceType,
      signal: input.signal,
    });
  } catch (e) {
    log.warn("design studio imagine pipeline skipped", { error: getErrorMessage(e) });
  }
  const imagineAssetsNotes = formatImagineAssetsForBuilder(imagineAssets);

  let html = "";
  let revisionNotes: string | undefined;
  let passCount = 0;

  for (
    let pass = 1 as DesignPassNumber;
    pass <= WIRELINE_DESIGN_TEAM.maxRefinementPasses;
    pass = (pass + 1) as DesignPassNumber
  ) {
    passCount = pass;

    onProgress?.(designStudioProgressLabel(pass, "build"));
    phases.push(`Pass ${pass} build`);
    html = await runDesignBuilder({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      researchNotes,
      imagineAssetsNotes: imagineAssetsNotes || undefined,
      revisionNotes,
      priorHtml: pass > 1 ? html : undefined,
      passNumber: pass,
      signal: input.signal,
    });

    onProgress?.(designStudioProgressLabel(pass, "visual"));
    phases.push(`Pass ${pass} visual`);
    html = await runGeminiVisualRefine({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      html,
      passNumber: pass,
      revisionNotes,
      imagineAssetsNotes: imagineAssetsNotes || undefined,
      signal: input.signal,
    });

    onProgress?.(designStudioProgressLabel(pass, "code"));
    phases.push(`Pass ${pass} code review`);
    const codeReview = await runCodeReview({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      html,
      passNumber: pass,
      signal: input.signal,
    });

    const passesBar =
      codeReviewPasses(codeReview, WIRELINE_DESIGN_TEAM.passScore) &&
      designQualityPasses(assessDesignStudioHtmlQuality(html));

    revisionNotes = mergeRevisionNotes(
      codeReview.revisionNotes,
      codeReview.issues.map((issue) => `- ${issue}`).join("\n"),
    );

    if (passesBar && pass >= WIRELINE_DESIGN_TEAM.minRefinementPasses) {
      break;
    }

    if (pass >= WIRELINE_DESIGN_TEAM.maxRefinementPasses) {
      break;
    }
  }

  const qualityReport = assessDesignStudioHtmlQuality(html);
  if (!designQualityPasses(qualityReport)) {
    onProgress?.("Stitch-quality polish…");
    phases.push("Stitch-quality gate");
    html = await runEmergencyPolish({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      html,
      qualityIssues: formatDesignQualityRevisionNotes(qualityReport),
      signal: input.signal,
    });
  }

  onProgress?.(nextStudioPhase());
  phases.push("Final approval");
  let approval: DesignFinalApproval;
  try {
    approval = await runFinalApproval({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      html,
      passCount,
      signal: input.signal,
    });
  } catch (e) {
    log.warn("design studio final approval fallback", { error: getErrorMessage(e) });
    approval = {
      operatorReply: "",
      pageTitle: input.operatorMessage.trim().slice(0, 72) || "Your page",
    };
  }

  if (imagineAssets.length > 0) {
    html = injectImagineAssetsIntoHtml(html, imagineAssets, previewDeviceType);
  }

  const pageTitle = approval.pageTitle?.trim() || "Your page";
  const operatorReply = approval.operatorReply?.trim() || buildFallbackOperatorReply(pageTitle);

  const packaged = await packageDirectorHtmlPrototypePreview({
    userId: input.userId,
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    html,
    title: pageTitle,
    deviceType: previewDeviceType,
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
