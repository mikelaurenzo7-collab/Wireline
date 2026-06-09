/**
 * Wireline Design Studio — Opus prep (Anthropic) → Sonnet/DeepSeek draft (OR) → Opus finish.
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
  type DesignTeamOpenRouterRole,
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
import { isOpenRouterConfigured, runOpenRouterCompletion } from "./openrouter-structured";
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

async function runOpenRouterRole(
  role: DesignTeamOpenRouterRole,
  system: string,
  user: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!isOpenRouterConfigured()) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  try {
    return await runOpenRouterCompletion({
      model: role.openRouterModelId,
      system,
      user,
      maxTokens,
      signal,
    });
  } catch (e) {
    if (role.fallbackOpenRouterModelId) {
      log.warn("design studio openrouter fallback", {
        from: role.openRouterModelId,
        to: role.fallbackOpenRouterModelId,
        error: getErrorMessage(e),
      });
      return runOpenRouterCompletion({
        model: role.fallbackOpenRouterModelId,
        system,
        user,
        maxTokens,
        signal,
      });
    }
    throw e;
  }
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

  const raw = await runOpenRouterRole(
    team.htmlBuilder,
    DESIGN_BUILDER_VISION_SYSTEM,
    user,
    maxTokensForPass(passNumber, "build"),
    designStageAbortSignal("build", input.signal),
  );

  const html = stripHtmlFences(raw);
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
    "- Opus tailored the concept; Sonnet drafted the page; Opus polished it for production",
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
  phases.push("Sonnet build");
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
