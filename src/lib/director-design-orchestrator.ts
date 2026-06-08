/**
 * Wireline Design Studio — Spectrum Desk linear pipeline (no architect tournament).
 *
 * Brief → Imagine → Qwen build/refine → Sonnet critic → MiniMax finish → gate → US localize.
 * Optional single Hy3 challenger when pass-1 quality gate fails.
 */
import { CLAUDE_MODELS } from "./claude-models";
import {
  formatImagineAssetsForBuilder,
  generateDesignImagineAssets,
  injectImagineAssetsIntoHtml,
} from "./director-design-imagine";
import type { DesignImagineAsset } from "./director-design-imagine";
import { formatJuryVerdictSummary, resolveArchitectJury } from "./director-design-jury";
import {
  buildDesignBuilderUserPrompt,
  buildEngineerUserPrompt,
  buildFinisherUserPrompt,
  buildVisualCriticUserPrompt,
  DESIGN_EMERGENCY_POLISH_SYSTEM,
  DESIGN_FINAL_APPROVAL_TOOL,
  DESIGN_FINAL_APPROVER_SYSTEM,
  DESIGN_HTML_ENGINEER_SYSTEM,
  DESIGN_LAYOUT_SCOUT_SYSTEM,
  DESIGN_PRODUCTION_FINISHER_SYSTEM,
  DESIGN_RESEARCH_SYSTEM,
  DESIGN_UI_ARCHITECT_SYSTEM,
  DESIGN_US_LOCALIZATION_SYSTEM,
  DESIGN_VISUAL_CRITIC_SYSTEM,
} from "./director-design-prompts";
import {
  assessDesignStudioHtmlQuality,
  designQualityPasses,
  formatDesignQualityRevisionNotes,
} from "./director-design-quality";
import {
  designStudioProgressLabel,
  designTeamThinkingSummary,
  type DesignArchitectSlot,
  type DesignPassNumber,
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
import type { DirectorStitchTurnInput, DirectorStitchTurnResult } from "./director-stitch-service";
import type { StitchProgressCallback } from "./director-stitch-service";
import { runCompletion } from "./claude-structured";
import {
  isOpenRouterConfigured,
  runOpenRouterCompletion,
  runOpenRouterStructured,
} from "./openrouter-structured";
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

function mergeRevisionNotes(...blocks: Array<string | undefined>): string {
  return blocks.filter(Boolean).join("\n\n").trim();
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

async function runSpectrumResearch(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  signal?: AbortSignal;
}): Promise<{ researchNotes: string; layoutScoutNotes: string }> {
  const team = spectrumTeam();
  if (!team) {
    const { text } = await runCompletion({
      model: CLAUDE_MODELS.SONNET,
      system: DESIGN_RESEARCH_SYSTEM,
      user: [
        `Operator request:\n${input.operatorMessage.trim()}`,
        `## design.md\n${input.designBriefMarkdown.trim().slice(0, 6000)}`,
      ].join("\n\n"),
      maxTokens: 2048,
    });
    return { researchNotes: text.trim(), layoutScoutNotes: "" };
  }

  const researchUser = [
    `Operator request:\n${input.operatorMessage.trim()}`,
    `## design.md\n${input.designBriefMarkdown.trim().slice(0, 6000)}`,
  ].join("\n\n");

  const [researchSettled, scoutSettled] = await Promise.allSettled([
    runOpenRouterRole(team.researcher, DESIGN_RESEARCH_SYSTEM, researchUser, 2048, input.signal),
    runOpenRouterRole(
      team.layoutScout,
      DESIGN_LAYOUT_SCOUT_SYSTEM,
      researchUser,
      512,
      input.signal,
    ),
  ]);

  const researchNotes =
    researchSettled.status === "fulfilled"
      ? researchSettled.value.trim()
      : "Focus on US local-business trust, phone-first CTA, distinctive hero.";

  const layoutScoutNotes = scoutSettled.status === "fulfilled" ? scoutSettled.value.trim() : "";

  return { researchNotes, layoutScoutNotes };
}

async function runPrimaryHtmlBuild(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  researchNotes: string;
  layoutScoutNotes: string;
  imagineAssetsNotes?: string;
  revisionNotes?: string;
  priorHtml?: string;
  passNumber: DesignPassNumber;
  signal?: AbortSignal;
}): Promise<string> {
  const team = spectrumTeam();
  if (!team) return input.priorHtml ?? "";

  const hasPrior = Boolean(input.priorHtml?.trim());
  const user = hasPrior
    ? buildEngineerUserPrompt({
        operatorMessage: input.operatorMessage,
        designBriefMarkdown: input.designBriefMarkdown,
        html: input.priorHtml!,
        passNumber: input.passNumber,
        researchNotes: input.researchNotes,
        imagineAssetsNotes: input.imagineAssetsNotes,
        winningArchitectLabel: "Spectrum primary",
      })
    : buildDesignBuilderUserPrompt({
        operatorMessage: input.operatorMessage,
        designBriefMarkdown: input.designBriefMarkdown,
        researchNotes: input.researchNotes,
        layoutScoutNotes: input.layoutScoutNotes,
        imagineAssetsNotes: input.imagineAssetsNotes,
        revisionNotes: input.revisionNotes,
        passNumber: input.passNumber,
      });

  try {
    const raw = await runOpenRouterRole(
      team.htmlBuilder,
      DESIGN_HTML_ENGINEER_SYSTEM,
      user,
      12_288,
      input.signal,
    );
    return stripHtmlFences(raw);
  } catch (e) {
    log.warn("design studio primary build failed", { error: getErrorMessage(e) });
    return input.priorHtml ?? "";
  }
}

async function runChallengerDraft(input: {
  architect: DesignArchitectSlot;
  operatorMessage: string;
  designBriefMarkdown: string;
  researchNotes: string;
  layoutScoutNotes: string;
  imagineAssetsNotes?: string;
  revisionNotes?: string;
  incumbentHtml: string;
  passNumber: DesignPassNumber;
  signal?: AbortSignal;
}): Promise<{ architectId: string; label: string; html: string } | null> {
  try {
    const user = buildDesignBuilderUserPrompt({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      researchNotes: input.researchNotes,
      layoutScoutNotes: input.layoutScoutNotes,
      imagineAssetsNotes: input.imagineAssetsNotes,
      revisionNotes: input.revisionNotes,
      priorHtml: input.incumbentHtml,
      passNumber: input.passNumber,
      architectLabel: input.architect.label,
    });
    const raw = await runOpenRouterCompletion({
      model: input.architect.openRouterModelId,
      system: DESIGN_UI_ARCHITECT_SYSTEM,
      user,
      maxTokens: 12_288,
      signal: input.signal,
    });
    const html = stripHtmlFences(raw);
    if (!html) return null;
    return { architectId: input.architect.id, label: input.architect.label, html };
  } catch (e) {
    log.warn("design studio challenger draft failed", {
      architect: input.architect.id,
      error: getErrorMessage(e),
    });
    return null;
  }
}

async function runOptionalChallenger(input: {
  incumbentHtml: string;
  operatorMessage: string;
  designBriefMarkdown: string;
  researchNotes: string;
  layoutScoutNotes: string;
  imagineAssetsNotes?: string;
  revisionNotes?: string;
  signal?: AbortSignal;
}): Promise<{ html: string; summary?: string }> {
  const team = spectrumTeam();
  if (!team?.enableOptionalChallenger) {
    return { html: input.incumbentHtml };
  }

  const challenger = await runChallengerDraft({
    architect: team.optionalChallenger,
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    researchNotes: input.researchNotes,
    layoutScoutNotes: input.layoutScoutNotes,
    imagineAssetsNotes: input.imagineAssetsNotes,
    revisionNotes: input.revisionNotes,
    incumbentHtml: input.incumbentHtml,
    passNumber: 1,
    signal: input.signal,
  });

  if (!challenger) return { html: input.incumbentHtml };

  const verdict = await resolveArchitectJury({
    entries: [
      { architectId: "incumbent", label: "Qwen primary", html: input.incumbentHtml },
      challenger,
    ],
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    passNumber: 1,
    glmCriticModelId: team.visualCritic.openRouterModelId,
    signal: input.signal,
  });

  return {
    html: verdict.winner.html,
    summary: formatJuryVerdictSummary(verdict),
  };
}

async function runVisualCritic(input: {
  html: string;
  operatorMessage: string;
  designBriefMarkdown: string;
  passNumber: DesignPassNumber;
  signal?: AbortSignal;
}): Promise<string> {
  const team = spectrumTeam();
  if (!team) return "";

  const user = buildVisualCriticUserPrompt(input);
  try {
    return (
      await runOpenRouterRole(
        team.visualCritic,
        DESIGN_VISUAL_CRITIC_SYSTEM,
        user,
        1536,
        input.signal,
      )
    ).trim();
  } catch (e) {
    log.warn("design studio visual critic skipped", { error: getErrorMessage(e) });
    return "";
  }
}

async function runProductionFinisher(input: {
  html: string;
  operatorMessage: string;
  designBriefMarkdown: string;
  passNumber: DesignPassNumber;
  criticNotes?: string;
  revisionNotes?: string;
  imagineAssetsNotes?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const team = spectrumTeam();
  if (!team) return input.html;

  const user = buildFinisherUserPrompt(input);
  try {
    const raw = await runOpenRouterRole(
      team.productionFinisher,
      DESIGN_PRODUCTION_FINISHER_SYSTEM,
      user,
      12_288,
      input.signal,
    );
    return stripHtmlFences(raw);
  } catch (e) {
    log.warn("design studio finisher skipped", { error: getErrorMessage(e) });
    return input.html;
  }
}

async function runEmergencyPolish(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  qualityIssues: string;
  signal?: AbortSignal;
}): Promise<string> {
  const team = spectrumTeam();
  const user = [
    `Operator request:\n${input.operatorMessage}`,
    `## design.md\n${input.designBriefMarkdown.slice(0, 4000)}`,
    `## Quality failures to fix\n${input.qualityIssues}`,
    `## HTML\n${input.html.slice(0, 24_000)}`,
  ].join("\n\n");

  if (team && isOpenRouterConfigured()) {
    try {
      const raw = await runOpenRouterRole(
        team.productionFinisher,
        DESIGN_EMERGENCY_POLISH_SYSTEM,
        user,
        12_288,
        input.signal,
      );
      return stripHtmlFences(raw);
    } catch (e) {
      log.warn("design studio emergency polish failed", { error: getErrorMessage(e) });
    }
  }

  const { text } = await runCompletion({
    model: CLAUDE_MODELS.SONNET,
    system: DESIGN_EMERGENCY_POLISH_SYSTEM,
    user,
    maxTokens: 12_288,
  });
  return stripHtmlFences(text);
}

async function runUsLocalization(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  html: string;
  passCount: number;
  signal?: AbortSignal;
}): Promise<{ html: string; approval: DesignFinalApproval }> {
  const team = spectrumTeam();
  const fallbackTitle = input.operatorMessage.trim().slice(0, 72) || "Your page";

  let html = input.html;
  if (team && isOpenRouterConfigured()) {
    try {
      const localized = await runOpenRouterRole(
        team.usLocalization,
        DESIGN_US_LOCALIZATION_SYSTEM,
        [
          `Operator request:\n${input.operatorMessage}`,
          `## HTML to localize for US audience\n${input.html.slice(0, 24_000)}`,
        ].join("\n\n"),
        12_288,
        input.signal,
      );
      html = stripHtmlFences(localized);
    } catch (e) {
      log.warn("design studio US HTML localization skipped", { error: getErrorMessage(e) });
    }
  }

  let approval: DesignFinalApproval = { operatorReply: "", pageTitle: fallbackTitle };
  if (team && isOpenRouterConfigured()) {
    try {
      const { result } = await runOpenRouterStructured<DesignFinalApproval>({
        model: team.usLocalization.openRouterModelId,
        system: DESIGN_FINAL_APPROVER_SYSTEM,
        user: [
          `Operator request:\n${input.operatorMessage}`,
          `Completed ${input.passCount} Spectrum Desk passes.`,
          `## design.md (excerpt)\n${input.designBriefMarkdown.slice(0, 3000)}`,
          `## HTML (excerpt)\n${html.slice(0, 12_000)}`,
        ].join("\n\n"),
        tool: DESIGN_FINAL_APPROVAL_TOOL,
        maxTokens: 2048,
        signal: input.signal,
      });
      approval = result;
    } catch (e) {
      log.warn("design studio final approval via OpenRouter failed", { error: getErrorMessage(e) });
    }
  }

  return { html, approval };
}

function buildFallbackOperatorReply(pageTitle: string): string {
  return [
    `Your **${pageTitle}** is ready — open the live preview to see it on your phone or desktop.`,
    "",
    "- Spectrum Desk built and polished your page for US trust copy",
    "- Hero, headline, and primary call-to-action are in place",
    "- Ask me to tweak colors, copy, or sections in chat",
  ].join("\n");
}

async function runSpectrumPass(input: {
  passNumber: DesignPassNumber;
  operatorMessage: string;
  designBriefMarkdown: string;
  researchNotes: string;
  layoutScoutNotes: string;
  imagineAssetsNotes?: string;
  revisionNotes?: string;
  incumbentHtml?: string;
  onProgress?: StitchProgressCallback;
  phases: string[];
  signal?: AbortSignal;
}): Promise<{ html: string }> {
  input.onProgress?.(designStudioProgressLabel(input.passNumber, "build"));
  input.phases.push(`Pass ${input.passNumber} build`);

  let html = await runPrimaryHtmlBuild({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    researchNotes: input.researchNotes,
    layoutScoutNotes: input.layoutScoutNotes,
    imagineAssetsNotes: input.imagineAssetsNotes,
    revisionNotes: input.revisionNotes,
    priorHtml: input.incumbentHtml,
    passNumber: input.passNumber,
    signal: input.signal,
  });

  if (!html.trim()) {
    throw new Error("Spectrum build: primary HTML generation failed");
  }

  input.onProgress?.(designStudioProgressLabel(input.passNumber, "critic"));
  input.phases.push(`Pass ${input.passNumber} critic`);
  const criticNotes = await runVisualCritic({
    html,
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    passNumber: input.passNumber,
    signal: input.signal,
  });

  input.onProgress?.(designStudioProgressLabel(input.passNumber, "finisher"));
  input.phases.push(`Pass ${input.passNumber} finisher`);
  html = await runProductionFinisher({
    html,
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    passNumber: input.passNumber,
    criticNotes,
    revisionNotes: input.revisionNotes,
    imagineAssetsNotes: input.imagineAssetsNotes,
    signal: input.signal,
  });

  return { html };
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
  phases.push("DeepSeek research");
  const { researchNotes, layoutScoutNotes } = await runSpectrumResearch({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    signal: input.signal,
  });

  const previewDeviceType = resolveDesignPreviewDeviceType({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
  });

  onProgress?.("Generating hero photography…");
  phases.push("Imagine hero");
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
  let challengerUsed = false;

  for (
    let pass = 1 as DesignPassNumber;
    pass <= WIRELINE_DESIGN_TEAM.maxRefinementPasses;
    pass = (pass + 1) as DesignPassNumber
  ) {
    passCount = pass;
    const priorHtml = pass > 1 ? html : undefined;

    const passResult = await runSpectrumPass({
      passNumber: pass,
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      researchNotes,
      layoutScoutNotes,
      imagineAssetsNotes: imagineAssetsNotes || undefined,
      revisionNotes,
      incumbentHtml: priorHtml,
      onProgress,
      phases,
      signal: input.signal,
    });
    html = passResult.html;

    onProgress?.(designStudioProgressLabel(pass, "gate"));
    phases.push(`Pass ${pass} gate`);
    let qualityReport = assessDesignStudioHtmlQuality(html);
    let passesGate = designQualityPasses(qualityReport);

    if (pass === 1 && !passesGate && !challengerUsed && spectrumTeam()?.enableOptionalChallenger) {
      onProgress?.(designStudioProgressLabel(1, "challenger"));
      phases.push("Hy3 challenger");
      const challenged = await runOptionalChallenger({
        incumbentHtml: html,
        operatorMessage: input.operatorMessage,
        designBriefMarkdown: input.designBriefMarkdown,
        researchNotes,
        layoutScoutNotes,
        imagineAssetsNotes: imagineAssetsNotes || undefined,
        revisionNotes,
        signal: input.signal,
      });
      challengerUsed = true;
      if (challenged.summary) phases.push(challenged.summary);
      if (challenged.html !== html) {
        html = challenged.html;
        const criticNotes = await runVisualCritic({
          html,
          operatorMessage: input.operatorMessage,
          designBriefMarkdown: input.designBriefMarkdown,
          passNumber: 1,
          signal: input.signal,
        });
        html = await runProductionFinisher({
          html,
          operatorMessage: input.operatorMessage,
          designBriefMarkdown: input.designBriefMarkdown,
          passNumber: 1,
          criticNotes,
          revisionNotes,
          imagineAssetsNotes: imagineAssetsNotes || undefined,
          signal: input.signal,
        });
        qualityReport = assessDesignStudioHtmlQuality(html);
        passesGate = designQualityPasses(qualityReport);
      }
    }

    revisionNotes = mergeRevisionNotes(
      revisionNotes,
      formatDesignQualityRevisionNotes(qualityReport),
    );

    if (passesGate && pass >= WIRELINE_DESIGN_TEAM.minRefinementPasses) {
      break;
    }

    if (pass >= WIRELINE_DESIGN_TEAM.maxRefinementPasses) {
      break;
    }
  }

  const qualityReport = assessDesignStudioHtmlQuality(html);
  if (!designQualityPasses(qualityReport)) {
    onProgress?.(designStudioProgressLabel(3, "gate"));
    phases.push("Emergency polish");
    html = await runEmergencyPolish({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
      html,
      qualityIssues: formatDesignQualityRevisionNotes(qualityReport),
      signal: input.signal,
    });
  }

  onProgress?.(designStudioProgressLabel(3, "localize"));
  phases.push("US localize");
  const { html: localizedHtml, approval } = await runUsLocalization({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
    html,
    passCount,
    signal: input.signal,
  });
  html = localizedHtml;

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

/** @deprecated Classic code-review shape — kept for tests importing the type. */
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
