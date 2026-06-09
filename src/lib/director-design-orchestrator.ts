/**
 * Wireline Design Studio — all-Opus pipeline (Anthropic end to end):
 * Opus creative vision → Opus HTML build → Opus implement/finish → Opus sign-off.
 * Claude Sonnet (Anthropic, direct) is the resilience fallback for the build pass.
 * The OpenRouter LLM picker is a Director-chat feature only and is not used here.
 */
import {
  DESIGN_BRIEF_OPUS_INPUT_CHARS,
  enrichDesignBriefWithOpusVision,
  sliceDesignBrief,
  type OpusDesignVisionResult,
} from "./director-design-context";
import { designStageAbortSignal, maxTokensForPass } from "./director-design-deadline";
import { ensureDesignKitInHtml } from "./director-design-kit-inject";
import { ensurePrototypeInteractivity } from "./director-design-prototype-interactive";
import {
  buildDesignBuilderUserPrompt,
  buildOpusImplementUserPrompt,
  buildOpusSignoffUserPrompt,
  DESIGN_BUILDER_VISION_SYSTEM,
  DESIGN_FINAL_APPROVAL_TOOL,
  DESIGN_OPUS_IMPLEMENT_SYSTEM,
  DESIGN_OPUS_SIGNOFF_SYSTEM,
  DESIGN_OPUS_VISION_SYSTEM,
  DESIGN_OPUS_VISION_TOOL,
} from "./director-design-prompts";
import { isPolishedDesignHtml } from "./director-design-quality";
import {
  designStudioProgressLabel,
  designTeamThinkingSummary,
  type DesignPassNumber,
  assertWirelineDesignRole,
  isSpectrumDesignTeam,
  WIRELINE_DESIGN_STUDIO_REASONING,
  WIRELINE_DESIGN_TEAM,
  WIRELINE_DESIGN_TEAM_SPECTRUM,
} from "./director-design-team";
import {
  extractDirectorHtmlPrototype,
  packageDirectorHtmlPrototypePreview,
  resolveDesignPreviewDeviceType,
} from "./director-html-prototype";
import { buildStitchDesignBriefArtifact } from "./director-stitch-brief";
import type {
  DirectorDesignStudioInput,
  DirectorDesignTurnResult,
  DesignProgressCallback,
} from "./director-design-turn";
import { runCompletion, runStructured } from "./claude-structured";
import { CLAUDE_MODELS } from "./claude-models";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

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

function spectrumTeam() {
  return isSpectrumDesignTeam(WIRELINE_DESIGN_TEAM) ? WIRELINE_DESIGN_TEAM_SPECTRUM : null;
}

async function runOpusCreativeVision(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  signal?: AbortSignal;
}): Promise<OpusDesignVisionResult> {
  const team = spectrumTeam();
  const fallback: OpusDesignVisionResult = {
    creativeVision: `Tailored landing concept for: ${input.operatorMessage.trim()}`,
    designBriefExtension: "",
  };
  if (!team?.creativeDirector) return fallback;

  const preparer = assertWirelineDesignRole(team.creativeDirector, "creativeDirector");

  try {
    return await runStructured<OpusDesignVisionResult>({
      model: preparer.wirelineModel,
      deepThink: true,
      system: DESIGN_OPUS_VISION_SYSTEM,
      user: [
        `## Operator request\n${input.operatorMessage.trim()}`,
        `## Starter design.md\n${sliceDesignBrief(input.designBriefMarkdown, DESIGN_BRIEF_OPUS_INPUT_CHARS)}`,
      ].join("\n\n"),
      tool: DESIGN_OPUS_VISION_TOOL,
      maxTokens: 4096,
      signal: designStageAbortSignal("opusVision", input.signal),
    });
  } catch (e) {
    log.warn("design studio opus vision failed", { error: getErrorMessage(e) });
    return fallback;
  }
}

async function runHtmlBuilderDraft(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const team = spectrumTeam();
  if (!team) {
    throw new Error("Spectrum team required for HTML build");
  }

  const passNumber = 1 as DesignPassNumber;
  const user = buildDesignBuilderUserPrompt({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    opusVisionNotes: input.opusVisionNotes,
    passNumber,
  });

  // The Painter build desk is Claude Opus (Anthropic, direct) — best-in-class
  // design aesthetics and instruction-following. Claude Sonnet (also Anthropic,
  // direct) is the resilience fallback so a transient Opus error never degrades
  // to a non-Claude model or a slop fallback. OpenRouter is intentionally unused.
  const opusModel = assertWirelineDesignRole(team.reviewer, "reviewer").wirelineModel;
  const maxTokens = maxTokensForPass(passNumber, "build");
  const buildWith = async (model: string): Promise<string> => {
    const { text } = await runCompletion({
      model,
      system: DESIGN_BUILDER_VISION_SYSTEM,
      user,
      maxTokens,
    });
    return stripHtmlFences(text);
  };

  let html: string;
  try {
    html = await buildWith(opusModel);
  } catch (e) {
    log.warn("design studio Opus build failed — retrying on Claude Sonnet", {
      error: getErrorMessage(e),
    });
    try {
      html = await buildWith(CLAUDE_MODELS.SONNET);
    } catch (e2) {
      // TEMP DIAGNOSTIC: surface the real builder error in the preview HTML.
      const m1 = getErrorMessage(e);
      const m2 = getErrorMessage(e2);
      return `<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="wl-build-error">OPUS_ERR: ${m1}\nSONNET_ERR: ${m2}\nopusModel=${opusModel} sonnetModel=${CLAUDE_MODELS.SONNET} maxTokens=${maxTokens}</pre></body></html>`;
    }
  }

  if (!html.trim()) {
    throw new Error("HTML builder: empty response");
  }
  return html;
}

async function runOpusSignOff(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  html: string;
  pipelinePhases: string[];
  signal?: AbortSignal;
}): Promise<DesignFinalApproval> {
  const team = spectrumTeam();
  const fallbackTitle = input.operatorMessage.trim().slice(0, 72) || "Your page";
  const fallback: DesignFinalApproval = { operatorReply: "", pageTitle: fallbackTitle };

  if (!team?.reviewer) return fallback;

  const preparer = assertWirelineDesignRole(team.reviewer, "reviewer");

  try {
    return await runStructured<DesignFinalApproval>({
      model: preparer.wirelineModel,
      system: DESIGN_OPUS_SIGNOFF_SYSTEM,
      user: buildOpusSignoffUserPrompt({
        ...input,
        passCount: 1,
      }),
      tool: DESIGN_FINAL_APPROVAL_TOOL,
      maxTokens: 2048,
      signal: designStageAbortSignal("signoff", input.signal),
    });
  } catch (e) {
    log.warn("design studio opus sign-off failed", { error: getErrorMessage(e) });
    return fallback;
  }
}

async function runOpusImplementHtml(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  draftHtml: string;
  pipelinePhases: string[];
  signal?: AbortSignal;
}): Promise<string> {
  const team = spectrumTeam();
  if (!team?.reviewer) return input.draftHtml;

  const preparer = assertWirelineDesignRole(team.reviewer, "reviewer");

  try {
    const { text } = await runCompletion({
      model: preparer.wirelineModel,
      system: DESIGN_OPUS_IMPLEMENT_SYSTEM,
      user: buildOpusImplementUserPrompt(input),
      maxTokens: 24_576,
    });
    const html = stripHtmlFences(text);
    if (!html.trim()) return input.draftHtml;
    if (!isPolishedDesignHtml(Buffer.from(html, "utf8"))) {
      log.warn("design studio opus implement returned thin HTML — keeping builder draft");
      return input.draftHtml;
    }
    return html;
  } catch (e) {
    log.warn("design studio opus implement failed — keeping builder draft", {
      error: getErrorMessage(e),
    });
    return input.draftHtml;
  }
}

async function runOpusCritiqueAndFinish(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  draftHtml: string;
  pipelinePhases: string[];
  signal?: AbortSignal;
}): Promise<DesignFinalApproval & { html: string }> {
  const html = await runOpusImplementHtml(input);
  const signoff = await runOpusSignOff({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    opusVisionNotes: input.opusVisionNotes,
    html,
    pipelinePhases: input.pipelinePhases,
    signal: input.signal,
  });
  return { html, ...signoff };
}

function buildFallbackOperatorReply(pageTitle: string): string {
  return [
    `Your **${pageTitle}** is ready — open the live preview to see it on your phone or desktop.`,
    "",
    "- Opus tailored the concept, built the page, and polished it for production",
    "- Hero, headline, and primary call-to-action are in place",
    "- Ask me to tweak colors, copy, or sections in chat",
  ].join("\n");
}

/** Run the full Design Studio pipeline and return a Director turn. */
export async function runDirectorDesignStudio(
  input: DirectorDesignStudioInput,
): Promise<DirectorDesignTurnResult> {
  const t0 = Date.now();
  const phases: string[] = [];
  const onProgress: DesignProgressCallback | undefined = input.onProgress;
  const studioPhases = WIRELINE_STITCH_UI.studioLoadingPhases;
  let phaseCursor = 0;
  const nextStudioPhase = () => studioPhases[phaseCursor++] ?? studioPhases.at(-1)!;

  onProgress?.(designStudioProgressLabel(1, "vision"));
  phases.push("Opus vision");
  const opusVision = await runOpusCreativeVision({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    signal: input.signal,
  });
  const { designBriefMarkdown, opusVisionNotes } = enrichDesignBriefWithOpusVision(
    input.designBriefMarkdown,
    opusVision,
  );

  onProgress?.(nextStudioPhase());
  phases.push("Opus brief");

  const previewDeviceType = resolveDesignPreviewDeviceType({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown,
  });

  onProgress?.(nextStudioPhase());
  phases.push("Opus build");
  let html = ensureDesignKitInHtml(
    await runHtmlBuilderDraft({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown,
      opusVisionNotes,
      signal: input.signal,
    }),
  );

  onProgress?.(nextStudioPhase());
  phases.push("Opus implement");
  onProgress?.(designStudioProgressLabel(1, "finish"));
  phases.push("Opus finish");
  const finished = await runOpusCritiqueAndFinish({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown,
    opusVisionNotes,
    draftHtml: html,
    pipelinePhases: phases,
    signal: input.signal,
  });
  html = ensurePrototypeInteractivity(ensureDesignKitInHtml(finished.html));

  const pageTitle = finished.pageTitle?.trim() || "Your page";
  const operatorReply = finished.operatorReply?.trim() || buildFallbackOperatorReply(pageTitle);

  const packaged = await packageDirectorHtmlPrototypePreview({
    userId: input.userId,
    operatorMessage: input.operatorMessage,
    designBriefMarkdown,
    html,
    title: pageTitle,
    deviceType: previewDeviceType,
  });

  const briefArtifact = buildStitchDesignBriefArtifact(designBriefMarkdown);

  return {
    reply: operatorReply,
    previews: [packaged.preview],
    artifacts: [briefArtifact, ...packaged.artifacts],
    designBriefMarkdown,
    thinkingSummary: designTeamThinkingSummary(phases) || WIRELINE_DESIGN_STUDIO_REASONING,
    durationMs: Date.now() - t0,
  };
}

/** @deprecated Classic code-review shape — kept for tests importing the type. */
export interface DesignCodeReviewResult {
  decision: "approve" | "revise";
  overall: number;
  structure: number;
  components: number;
  visual_polish: number;
  mobile: number;
  accessibility: number;
  strengths: string[];
  issues: string[];
  revisionNotes?: string;
}
