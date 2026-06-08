/**
 * Director routes — account-level strategist chat + creative artifact tooling.
 */
import express, { type Response } from "express";
import { AppError } from "../lib/api-error";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { and, eq, gte, sql } from "drizzle-orm";
import { listAgentSummariesForUser } from "../lib/agents-store";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser, authenticateEventStream } from "../middleware/auth";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import {
  validateBody,
  directorMessageSchema,
  directorStreamMessageSchema,
  directorExecuteSchema,
  directorProposalResolveSchema,
  pdfUploadSchema,
  directorChatModelPatchSchema,
} from "../lib/api-validation";
import { enforceSpendCap, enforce24hSpendCap } from "../lib/spend-guards";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import { type DirectorFleetAgent } from "../lib/director-planner";
import {
  executeDirectorCommsAction,
  executeDirectorIntegrationJob,
} from "../lib/director-executor";
import type { DirectorIntegrationJob, DirectorProposedAction } from "../lib/director-fleet-plan";
import {
  planDirectorTurnResilient,
  buildDirectorStreamContext,
  previewDirectorStreamRouting,
  type DirectorTurnResult,
} from "../lib/director-turn";
import { withAudit } from "../middleware/audit-middleware";
import { parseDirectorChatModelSelection } from "../lib/director-model-selection";
import {
  loadDirectorChatModelPreference,
  saveDirectorChatModelPreference,
} from "../lib/director-model-preference";
import {
  directorLlmConfigured,
  directorStreamMetaModel,
  resolveDirectorModelSelection,
  validateDirectorChatModelSelection,
} from "../lib/director-model-policy";
import { isOpenRouterConfigured, listOpenRouterModelsForDirector } from "../lib/openrouter-models";
import {
  getEffectiveSubscriptionPlanId,
  openRouterAllowedForEntitlements,
} from "../lib/plan-entitlements";
import { runDirectorStreamLlm } from "../lib/director-stream-runner";
import { createSseStream, writeSseBootstrap, type SseStreamHandle } from "../lib/sse-stream";
import { loadDirectorFeatureFlags } from "../lib/director-feature-flags";
import {
  checkCreativePolicy,
  exportBrandPack,
  generateLogoConcepts,
  normalizeVectorSvg,
} from "../lib/director-logo-tools";
import { buildCreativeDirectorTurn, isCreativeIntent } from "../lib/director-creative-turn";
import {
  buildDirectorMetadataFromTurn,
  packDirectorMetadata,
  parseDirectorMetadata,
} from "../lib/director-message-metadata";
import {
  buildSignedDownloadUrl,
  buildSignedPreviewUrl,
  clearDirectorArtifacts,
  listDirectorArtifacts,
  loadDirectorArtifactBase64,
  loadDirectorArtifactData,
  storeDirectorArtifact,
  streamBase64ToResponse,
  verifySignedDownloadToken,
} from "../lib/director-artifacts";
import {
  ensureDirectorSchema,
  insertDirectorMessage,
  listDirectorArtifactsSafe,
  loadDirectorMessages,
  patchDirectorMessageResolved,
} from "../lib/director-store";
import { persistDirectorDeliverableArtifact } from "../lib/director-deliverable-artifacts";
import { attachDesignHtmlPrototypeToTurn } from "../lib/director-html-prototype";
import type { DirectorFeatureFlags } from "../lib/director-feature-flags";
import { wantsLongDeliverable } from "../lib/director-deliverables";
import { WIRELINE_STITCH_UI } from "../lib/wireline-director-design";
import {
  resolveDesignDirectorPath,
  DESIGN_LLM_MODEL_LABEL,
  DESIGN_LLM_REASONING,
  type DesignLlmFallback,
} from "../lib/director-design-path";
import {
  DIRECTOR_THREAD_KEY,
  PAINTER_THREAD_KEY,
  parseDirectorThreadKey,
  type DirectorConversationThreadKey,
} from "../lib/director-thread-keys";
import { WIRELINE_PAINTER_UI } from "../lib/wireline-painter-design";
import {
  hasPendingStitchClarifyInHistory,
  isStitchDesignModeActive,
  wantsStitchMediaRequest,
} from "../lib/director-stitch-intent";
import {
  collapseDirectorThreadDuplicates,
  insertDirectorReplyIfAbsent,
  isDirectorStubReply,
  loadExistingDirectorTurnResponse,
} from "../lib/director-turn-persist";

const router = express.Router();
const directorArtifactDownloadLimiter = createIpRateLimiter({
  bucket: "api:director-download",
  windowMs: 60 * 1000,
  max: 60,
});

const MAX_THREAD_LENGTH = 200;
const CLAUDE_CONTEXT_WINDOW = 40;

async function loadFleet(userId: string): Promise<DirectorFleetAgent[]> {
  return listAgentSummariesForUser(userId);
}

async function loadFleetSafe(userId: string): Promise<DirectorFleetAgent[]> {
  try {
    return await loadFleet(userId);
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.warn("director fleet load failed", { error: getErrorMessage(e), userId });
    return [];
  }
}

async function loadDirectorWeekStats(
  userId: string,
): Promise<{ calls7d?: number; bookings7d?: number } | undefined> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [[calls], [bookings]] = await Promise.all([
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.userId, userId), gte(schema.callLogs.createdAt, since))),
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.appointments)
        .where(
          and(eq(schema.appointments.userId, userId), gte(schema.appointments.createdAt, since)),
        ),
    ]);
    return { calls7d: calls?.n ?? 0, bookings7d: bookings?.n ?? 0 };
  } catch {
    return undefined;
  }
}

function directorTurnToStreamDone(turn: DirectorTurnResult) {
  return {
    reply: turn.reply,
    suggestions: turn.suggestions,
    changes: turn.changes,
    toolToggles: turn.toolToggles,
    actions: turn.actions,
    integrationJobs: turn.integrationJobs,
    mode: turn.mode,
    focusAgentId: turn.focusAgentId,
    focusAgentName: turn.focusAgentName,
    model: turn.model,
    modelLabel: turn.modelLabel,
    modelProvider: turn.modelProvider,
    modelId: turn.modelId,
    reasoning: turn.reasoning,
    thinkingDurationMs: turn.thinkingDurationMs,
    researchSources: turn.researchSources,
  };
}

/** Emit `done` immediately, then persist in the background — avoids proxy drops during artifact DB work. */
async function finalizeDirectorStreamTurn(
  sse: SseStreamHandle,
  userId: string,
  operatorMessage: string,
  reply: string,
  donePayload: Record<string, unknown>,
  thinking: string | null | undefined,
  featureFlags: ReturnType<typeof loadDirectorFeatureFlags>,
  threadKey: DirectorConversationThreadKey = DIRECTOR_THREAD_KEY,
): Promise<boolean> {
  const trimmed = reply.trim();
  if (!trimmed) return false;

  const quickPayload = { ...donePayload, reply: trimmed };
  // Full payload on `reply` so clients that lose the terminal `done` chunk still
  // have proposals / Apply cards in latestReplyRef for finishWithPartialReply.
  sse.write("reply", quickPayload);
  sse.write("done", quickPayload);
  sse.end();

  void (async () => {
    try {
      const enriched = await enrichDirectorTurnPayload(
        userId,
        operatorMessage,
        quickPayload,
        featureFlags,
      );
      const insertResult = await insertDirectorReplyIfAbsent({
        userId,
        operatorMessage,
        reply: trimmed,
        threadKey,
        reasoning: thinking || null,
        metadata: packDirectorMetadata(buildDirectorMetadataFromTurn(enriched)),
      });
      if (insertResult === "skipped_duplicate" || insertResult === "skipped_stub") {
        log.info("director stream persist skipped", { userId, insertResult });
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("director stream persist failed", { error: getErrorMessage(err), userId });
    }
  })();

  return true;
}

function operatorSnippetMatchesArtifactPreview(snippet: string, preview: string): boolean {
  const minLen = 15;
  const a = snippet.trim().slice(0, 60);
  const b = preview.trim().slice(0, 60);
  if (a.length < minLen || b.length < minLen) return false;
  return preview.startsWith(a) || snippet.startsWith(b) || a.startsWith(b) || b.startsWith(a);
}

function filterDirectorArtifactsForThread(
  messagesDesc: Array<{ role: string; metadata: unknown }>,
  artifacts: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const asc = [...messagesDesc].reverse();
  const operatorSnippets = asc
    .filter((m) => m.role === "operator")
    .slice(-6)
    .map((m) => {
      const row = m as { content?: string };
      return typeof row.content === "string" ? row.content.trim().slice(0, 120) : "";
    })
    .filter(Boolean);

  return artifacts.filter((a) => {
    if (
      a.toolName !== "director_deliverable" &&
      a.toolName !== "google_stitch" &&
      a.toolName !== "wireline_design_studio"
    ) {
      return true;
    }
    const preview = (
      a.metadata as { operatorPreview?: string } | undefined
    )?.operatorPreview?.trim();
    if (!preview) return false;
    return operatorSnippets.some((s) => operatorSnippetMatchesArtifactPreview(s, preview));
  });
}

/** Recover a completed turn from DB when the stream errors after persist (or parallel retry). */
async function emitStreamDoneFromPersisted(
  sse: SseStreamHandle,
  userId: string,
  operatorMessage: string,
  threadKey: DirectorConversationThreadKey = DIRECTOR_THREAD_KEY,
): Promise<boolean> {
  const existing = await loadExistingDirectorTurnResponse(userId, operatorMessage, threadKey);
  if (!existing || isDirectorStubReply(existing.content)) return false;
  sse.write("thinking_end", {
    thinking: existing.reasoning ?? "",
    durationMs: 0,
  });
  sse.write("done", jsonFromPersistedDirectorTurn(existing));
  sse.end();
  return true;
}

function jsonFromPersistedDirectorTurn(
  existing: NonNullable<Awaited<ReturnType<typeof loadExistingDirectorTurnResponse>>>,
): Record<string, unknown> {
  const meta = existing.metadata;
  return {
    reply: existing.content,
    reasoning: existing.reasoning || undefined,
    suggestions: meta.suggestions,
    approvals: meta.approvals,
    previews: meta.previews,
    clarifyingQuestions: meta.clarifyingQuestions,
    changes: meta.proposals?.changes,
    toolToggles: meta.proposals?.toolToggles,
    actions: meta.proposals?.actions,
    integrationJobs: meta.proposals?.integrationJobs,
    model: meta.model,
    modelLabel: meta.modelLabel,
    modelProvider: meta.modelProvider,
    modelId: meta.modelId,
    thinkingDurationMs: meta.thinkingDurationMs,
    focusAgentId: meta.coachAgentId,
    focusAgentName: meta.coachAgentName,
    mode: meta.mode,
    researchSources: meta.researchSources,
    deliverableArtifact: meta.deliverableArtifact,
    artifacts: meta.deliverableArtifact ? [meta.deliverableArtifact] : undefined,
    stitchSession: meta.stitchSession,
    stitchAssetsPending: meta.stitchAssetsPending === true ? true : undefined,
  };
}

function resolveRequestThreadKey(req: AuthenticatedRequest): DirectorConversationThreadKey {
  const fromBody = req.body?.threadKey;
  const fromQuery = req.query?.thread;
  if (typeof fromBody === "string") return parseDirectorThreadKey(fromBody);
  if (typeof fromQuery === "string") return parseDirectorThreadKey(fromQuery);
  return DIRECTOR_THREAD_KEY;
}

async function persistOperatorMessageIfNeeded(
  userId: string,
  operatorMessage: string,
  priorMessages: Awaited<ReturnType<typeof loadDirectorMessages>>,
  skipPersist: boolean,
  threadKey: DirectorConversationThreadKey = DIRECTOR_THREAD_KEY,
) {
  if (!operatorMessage) return;
  const last = priorMessages.messages[0];
  const duplicatePending =
    skipPersist && last?.role === "operator" && last.content.trim() === operatorMessage;
  if (!duplicatePending) {
    await insertDirectorMessage({
      userId,
      role: "operator",
      content: operatorMessage,
      threadKey,
    });
  }
}

interface DirectorApprovalRequest {
  callId: string;
  name: "generate_logo" | "vectorize_logo" | "brand_pack_export";
  approved: boolean;
  input: Record<string, unknown>;
}

interface DirectorToolPreview {
  conceptId: string;
  title: string;
  rationale: string;
  previewDataUrl: string;
  svg?: string;
}

interface DirectorToolExecutionResult {
  reply: string;
  previews?: DirectorToolPreview[];
  artifacts?: Array<Record<string, unknown>>;
  telemetry: {
    tool: string;
    success: boolean;
    latencyMs: number;
    costUsd: number;
  };
}

async function attachDeliverableArtifactToTurn(
  userId: string,
  operatorMessage: string,
  reply: string,
  featureFlags: DirectorFeatureFlags,
  turnData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!featureFlags.artifactsPanel || !operatorMessage.trim() || !reply.trim()) {
    return turnData;
  }
  const saved = await persistDirectorDeliverableArtifact({
    userId,
    operatorMessage,
    reply,
  });
  if (!saved) return turnData;
  const deliverableArtifact = {
    ...saved,
    downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", saved.id, userId),
  };
  const existingArtifacts = Array.isArray(turnData.artifacts) ? turnData.artifacts : [];
  return {
    ...turnData,
    deliverableArtifact,
    artifacts: [deliverableArtifact, ...existingArtifacts],
  };
}

/** Inline HTML preview metadata + deliverable artifact attachment for persisted turns. */
async function enrichDirectorTurnPayload(
  userId: string,
  operatorMessage: string,
  turnData: Record<string, unknown>,
  featureFlags: DirectorFeatureFlags,
): Promise<Record<string, unknown>> {
  const withPreview = await attachDesignHtmlPrototypeToTurn(userId, operatorMessage, turnData);
  const reply = typeof withPreview.reply === "string" ? withPreview.reply : "";
  return attachDeliverableArtifactToTurn(userId, operatorMessage, reply, featureFlags, withPreview);
}

function withSignedUrl(
  userId: string,
  artifact: Awaited<ReturnType<typeof listDirectorArtifacts>>[number],
): Record<string, unknown> {
  return {
    id: artifact.id,
    name: artifact.name,
    toolName: artifact.toolName,
    artifactType: artifact.artifactType,
    mimeType: artifact.mimeType,
    sizeBytes: artifact.sizeBytes,
    metadata: artifact.metadata ?? {},
    createdAt: artifact.createdAt,
    downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", artifact.id, userId),
  };
}

async function executeDirectorToolCall(
  userId: string,
  approval: DirectorApprovalRequest,
): Promise<DirectorToolExecutionResult> {
  const t0 = Date.now();
  try {
    if (approval.name === "generate_logo") {
      const prompt = String(approval.input.prompt || "").trim();
      const policy = checkCreativePolicy(prompt);
      if (!policy.allowed) {
        return {
          reply: policy.reason || "Creative generation request was blocked.",
          telemetry: {
            tool: approval.name,
            success: false,
            latencyMs: Date.now() - t0,
            costUsd: 0,
          },
        };
      }

      const generated = generateLogoConcepts({
        prompt,
        style: String(approval.input.style || ""),
        colors: String(approval.input.colors || ""),
        usage: String(approval.input.usage || ""),
        concepts: Number(approval.input.concepts || 3),
      });

      const artifactRecords: Array<Record<string, unknown>> = [];
      for (const [index, concept] of generated.concepts.entries()) {
        const saved = await storeDirectorArtifact({
          userId,
          toolName: "generate_logo",
          artifactType: "svg-concept",
          name: `logo-concept-${index + 1}.svg`,
          mimeType: "image/svg+xml",
          data: Buffer.from(concept.svg, "utf8"),
          metadata: {
            conceptId: concept.conceptId,
            title: concept.title,
            score: concept.score,
            version: 1,
          },
        });
        artifactRecords.push({
          ...saved,
          downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", saved.id, userId),
        });
      }

      const selected = generated.concepts.find((c) => c.conceptId === generated.chosenConceptId);
      if (selected) {
        const pack = exportBrandPack({
          conceptId: selected.conceptId,
          conceptName: selected.title,
          svg: selected.svg,
          prompt: generated.brief.prompt,
          style: generated.brief.style,
          colors: generated.brief.colors,
          usage: generated.brief.usage,
        });
        const zipSaved = await storeDirectorArtifact({
          userId,
          toolName: "brand_pack_export",
          artifactType: "brand-pack",
          name: `brand-pack-${selected.conceptId}.zip`,
          mimeType: "application/zip",
          data: pack.zip,
          metadata: {
            conceptId: selected.conceptId,
            conceptName: selected.title,
            formats: ["svg", "png", "pdf"],
            version: 1,
          },
        });
        artifactRecords.unshift({
          ...zipSaved,
          downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", zipSaved.id, userId),
        });
      }

      const previews = generated.concepts.map((c) => ({
        conceptId: c.conceptId,
        title: c.title,
        rationale: c.rationale,
        previewDataUrl: c.previewDataUrl,
        svg: c.svg,
      }));

      return {
        reply: `Created ${generated.concepts.length} logo concepts. ${generated.critique} I also packaged a downloadable brand ZIP.`,
        previews,
        artifacts: artifactRecords,
        telemetry: { tool: approval.name, success: true, latencyMs: Date.now() - t0, costUsd: 0 },
      };
    }

    if (approval.name === "vectorize_logo") {
      const conceptId = String(approval.input.concept_id || "").trim();
      const svg = normalizeVectorSvg(String(approval.input.svg || ""));
      const saved = await storeDirectorArtifact({
        userId,
        toolName: "vectorize_logo",
        artifactType: "svg-vector",
        name: `vectorized-${conceptId || "logo"}.svg`,
        mimeType: "image/svg+xml",
        data: Buffer.from(svg, "utf8"),
        metadata: { conceptId, version: 1 },
      });

      return {
        reply: "Vector export ready.",
        artifacts: [
          {
            ...saved,
            downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", saved.id, userId),
          },
        ],
        telemetry: { tool: approval.name, success: true, latencyMs: Date.now() - t0, costUsd: 0 },
      };
    }

    if (approval.name === "brand_pack_export") {
      const pack = exportBrandPack({
        conceptId: String(approval.input.concept_id || "logo"),
        conceptName: String(approval.input.concept_name || "Logo"),
        svg: String(approval.input.svg || ""),
        prompt: String(approval.input.prompt || ""),
        style: String(approval.input.style || ""),
        colors: String(approval.input.colors || ""),
        usage: String(approval.input.usage || ""),
      });
      const saved = await storeDirectorArtifact({
        userId,
        toolName: "brand_pack_export",
        artifactType: "brand-pack",
        name: `brand-pack-${String(approval.input.concept_id || "logo")}.zip`,
        mimeType: "application/zip",
        data: pack.zip,
        metadata: { ...pack.metadata, version: 1 },
      });

      return {
        reply: "Brand pack exported with SVG/PNG/PDF variants.",
        artifacts: [
          {
            ...saved,
            downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", saved.id, userId),
          },
        ],
        telemetry: { tool: approval.name, success: true, latencyMs: Date.now() - t0, costUsd: 0 },
      };
    }

    return {
      reply: "That tool is not supported.",
      telemetry: { tool: approval.name, success: false, latencyMs: Date.now() - t0, costUsd: 0 },
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    return {
      reply: `Tool execution failed: ${getErrorMessage(e)}`,
      telemetry: { tool: approval.name, success: false, latencyMs: Date.now() - t0, costUsd: 0 },
    };
  }
}

router.get(
  "/api/director/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const fleet = await loadFleetSafe(req.user.id);
      const { artifacts, degraded: artifactsDegraded } = await listDirectorArtifactsSafe(
        req.user.id,
        200,
      );
      const threadKey = resolveRequestThreadKey(req);
      const { messages, degraded: messagesDegraded } = await loadDirectorMessages(
        req.user.id,
        MAX_THREAD_LENGTH,
        threadKey,
      );
      const degraded = messagesDegraded || artifactsDegraded;

      const chatModelPreference = await loadDirectorChatModelPreference(req.user.id);

      res.json({
        fleet,
        featureFlags: loadDirectorFeatureFlags(),
        chatModelPreference,
        openRouterEnabled: isOpenRouterConfigured(),
        artifacts: filterDirectorArtifactsForThread(
          messages,
          artifacts.map((a) => withSignedUrl(req.user.id, a)),
        ),
        degraded: degraded || undefined,
        messages: collapseDirectorThreadDuplicates(messages.reverse()).map((m) => {
          const meta = parseDirectorMetadata(m.metadata);
          return {
            id: String(m.id),
            role: m.role,
            content: m.content,
            reasoning: m.reasoning || undefined,
            createdAt: m.createdAt,
            suggestions: meta.suggestions,
            approvals: meta.approvals,
            previews: meta.previews,
            clarifyingQuestions: meta.clarifyingQuestions,
            researchSources: meta.researchSources,
            proposals: meta.proposals,
            model: meta.model,
            modelLabel: meta.modelLabel,
            modelProvider: meta.modelProvider,
            modelId: meta.modelId,
            thinkingDurationMs: meta.thinkingDurationMs,
            coachAgentId: meta.coachAgentId,
            coachAgentName: meta.coachAgentName,
            mode: meta.mode,
            deliverableArtifact: meta.deliverableArtifact,
            stitchSession: meta.stitchSession,
            stitchAssetsPending: meta.stitchAssetsPending === true ? true : undefined,
            resolved: meta.resolved,
          };
        }),
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director messages fetch failed", { error: getErrorMessage(e) });
      let fleet: DirectorFleetAgent[] = [];
      try {
        fleet = await loadFleetSafe(req.user.id);
      } catch {
        fleet = [];
      }
      res.json({
        fleet,
        featureFlags: loadDirectorFeatureFlags(),
        artifacts: [],
        messages: [],
        degraded: true,
      });
    }
  },
);

router.get(
  "/api/director/chat-models",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preference = await loadDirectorChatModelPreference(req.user.id);
      const planId = await getEffectiveSubscriptionPlanId(req.user.id, req.user.email);
      const planAllowsOpenRouter = openRouterAllowedForEntitlements(planId, req.user.email);
      const { enabled, curated, catalog } = await listOpenRouterModelsForDirector();
      res.json({
        preference,
        openRouterEnabled: enabled && planAllowsOpenRouter,
        openRouterRequiresUpgrade: enabled && !planAllowsOpenRouter,
        wirelineTiers: [
          {
            id: "auto",
            label: "Auto (recommended)",
            description: "Sonnet by default; Opus for deep fleet strategy",
          },
          { id: "sonnet", label: "Sonnet", description: "Fast, balanced Director turns" },
          { id: "opus", label: "Opus", description: "Deep analysis + extended thinking" },
        ],
        curated,
        catalog,
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director chat-models failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load chat models");
    }
  },
);

router.patch(
  "/api/director/chat-model",
  authenticateUser,
  validateBody(directorChatModelPatchSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = parseDirectorChatModelSelection(req.body.selection);
    if (!parsed) {
      throw AppError.fromHttpStatus(400, "Invalid model selection");
    }
    const planId = await getEffectiveSubscriptionPlanId(req.user.id, req.user.email);
    const validated = await validateDirectorChatModelSelection(parsed, {
      planId,
      email: req.user.email,
    });
    if (!validated.ok) {
      return res.status(validated.status).json({
        code: "ERROR",
        error: validated.error,
      });
    }
    try {
      const saved = await saveDirectorChatModelPreference(req.user.id, validated.selection);
      res.json({ preference: saved });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director chat-model save failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to save model preference");
    }
  },
);

router.post(
  "/api/director/messages",
  authenticateUser,
  claudeRateLimiter,
  enforce24hSpendCap,
  enforceSpendCap,
  withAudit("director"),
  validateBody(directorMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const featureFlags = loadDirectorFeatureFlags();
      const threadKey = resolveRequestThreadKey(req);
      const operatorMessage = String(req.body.content || "").trim();
      const focusAgentId = String(req.body.focusAgentId || "").trim() || undefined;
      const approval = req.body.approval as DirectorApprovalRequest | undefined;
      const stitchOptions =
        threadKey === PAINTER_THREAD_KEY
          ? { ...(req.body?.stitchOptions ?? {}), designMode: true as const }
          : req.body?.stitchOptions;

      const fleet = await loadFleetSafe(req.user.id);

      const stats = await loadDirectorWeekStats(req.user.id);

      const priorMessages = await loadDirectorMessages(
        req.user.id,
        CLAUDE_CONTEXT_WINDOW,
        threadKey,
      );

      const history = priorMessages.messages.reverse().map((m) => ({
        role: m.role === "operator" ? ("operator" as const) : ("director" as const),
        content: m.content,
      }));

      if (operatorMessage) {
        await persistOperatorMessageIfNeeded(
          req.user.id,
          operatorMessage,
          priorMessages,
          req.body?.skipOperatorPersist === true,
          threadKey,
        );
      }

      if (operatorMessage && req.body?.skipOperatorPersist === true) {
        const existing = await loadExistingDirectorTurnResponse(
          req.user.id,
          operatorMessage,
          threadKey,
        );
        if (existing) {
          return res.json(jsonFromPersistedDirectorTurn(existing));
        }
      }

      let reply = "";
      let suggestions: unknown[] = [];
      let model: "sonnet" | "opus" = "sonnet";
      let modelLabel: string | undefined;
      let modelProvider: "wireline" | "openrouter" | undefined;
      let modelId: string | undefined;
      let approvals: unknown[] = [];
      let previews: unknown[] = [];
      let artifacts: unknown[] = [];
      let clarifyingQuestions: string[] = [];
      let toolTelemetry: Record<string, unknown> | undefined;
      let reasoning: string | undefined;
      let thinkingDurationMs: number | undefined;
      let changes: unknown[] = [];
      let toolToggles: unknown[] = [];
      let actions: unknown[] = [];
      let integrationJobs: unknown[] = [];
      let mode: "fleet" | "coach" = "fleet";
      let coachAgentId: string | undefined;
      let coachAgentName: string | undefined;
      let researchSources: { title?: string; uri?: string }[] | undefined;
      let stitchSession:
        | {
            projectId: string;
            screenId: string;
            projectTitle?: string;
            deviceType?: "DESKTOP" | "MOBILE" | "TABLET" | "AGNOSTIC";
            renderId?: string;
            operatorMessage?: string;
          }
        | undefined;
      let stitchAssetsPending = false;

      if (approval && featureFlags.toolExecution) {
        if (!approval.approved) {
          reply =
            "Understood — I canceled that tool call. If you want changes, tell me how you'd like to adjust it.";
        } else {
          const executed = await executeDirectorToolCall(req.user.id, approval);
          reply = executed.reply;
          previews = executed.previews ?? [];
          artifacts = executed.artifacts ?? [];
          toolTelemetry = executed.telemetry;
          log.info("director tool call", {
            userId: req.user.id,
            tool: executed.telemetry.tool,
            success: executed.telemetry.success,
            latencyMs: executed.telemetry.latencyMs,
            costUsd: executed.telemetry.costUsd,
          });
        }
      } else if (
        operatorMessage &&
        featureFlags.toolExecution &&
        featureFlags.creativeTools &&
        isCreativeIntent(operatorMessage) &&
        threadKey === DIRECTOR_THREAD_KEY
      ) {
        const creative = buildCreativeDirectorTurn(operatorMessage, history);
        reply = creative.reply;
        approvals = creative.approvals;
        clarifyingQuestions = creative.clarifyingQuestions;
      } else if (
        operatorMessage &&
        threadKey === DIRECTOR_THREAD_KEY &&
        featureFlags.designStudio &&
        wantsStitchMediaRequest(operatorMessage) &&
        !isStitchDesignModeActive(stitchOptions) &&
        !hasPendingStitchClarifyInHistory(history)
      ) {
        reply = WIRELINE_PAINTER_UI.buildHandoffReply(operatorMessage);
        modelLabel = "Director";
        modelProvider = "wireline";
      } else {
        let stitchDesignFallback: DesignLlmFallback | undefined;
        const stitchPath =
          operatorMessage && featureFlags.designStudio
            ? await resolveDesignDirectorPath({
                userId: req.user.id,
                operatorMessage,
                history,
                stitchOptions,
              })
            : { kind: "none" as const };

        if (stitchPath.kind === "design") {
          const stitchTurn = stitchPath.turn;
          reply = stitchTurn.reply;
          previews = stitchTurn.previews;
          artifacts = stitchTurn.artifacts;
          clarifyingQuestions = stitchTurn.clarifyingQuestions ?? clarifyingQuestions;
          modelLabel =
            threadKey === PAINTER_THREAD_KEY
              ? WIRELINE_PAINTER_UI.modelLabel
              : WIRELINE_STITCH_UI.modelLabel;
          modelProvider = "wireline";
          thinkingDurationMs = stitchTurn.durationMs;
          reasoning = stitchTurn.thinkingSummary;
        } else {
          if (stitchPath.kind === "llm-fallback") {
            stitchDesignFallback = stitchPath.fallback;
            artifacts = stitchPath.fallback.artifacts;
          }

          const resolved = await resolveDirectorModelSelection(
            req.user.id,
            req.body ?? {},
            loadDirectorChatModelPreference,
            req.user.email,
          );
          if (!resolved.ok) {
            reply =
              resolved.status === 503
                ? "The selected model isn't available on this workspace yet. Your message is saved — try Wireline Auto or contact your admin."
                : "That model isn't available. Your message is saved — pick another model from the composer.";
          } else if (!directorLlmConfigured(resolved.selection)) {
            reply =
              resolved.selection.provider === "openrouter"
                ? "OpenRouter isn't configured on this workspace yet. Your message is saved — pick Wireline Auto or ask your admin to add OPENROUTER_API_KEY."
                : "I can't respond right now — the LLM isn't configured. Your message is saved; try again later.";
          } else {
            try {
              const turn = await planDirectorTurnResilient({
                userId: req.user.id,
                operatorMessage,
                history,
                fleet,
                stats,
                focusAgentId,
                forceDeep: req.body?.forceDeep === true,
                modelSelection: resolved.selection,
                deliverableGuidance: stitchDesignFallback?.deliverableGuidance,
                designRenderFallback: Boolean(stitchDesignFallback),
              });
              reply = turn.reply;
              suggestions = turn.suggestions;
              model = turn.model;
              modelLabel = stitchDesignFallback ? DESIGN_LLM_MODEL_LABEL : turn.modelLabel;
              modelProvider = stitchDesignFallback ? "wireline" : turn.modelProvider;
              modelId = turn.modelId;
              reasoning = stitchDesignFallback ? DESIGN_LLM_REASONING : turn.reasoning;
              thinkingDurationMs = turn.thinkingDurationMs;
              changes = turn.changes;
              toolToggles = turn.toolToggles;
              actions = turn.actions;
              integrationJobs = turn.integrationJobs;
              mode = turn.mode;
              coachAgentId = turn.focusAgentId;
              coachAgentName = turn.focusAgentName;
              researchSources = turn.researchSources;
            } catch (e) {
              if (e instanceof AppError) throw e;
              log.error("director planner failed", { error: getErrorMessage(e) });
              reply =
                "Sorry — I'm having trouble responding right now. Your message is saved; try again in a moment.";
            }

            if (
              !stitchDesignFallback &&
              isDirectorStubReply(reply) &&
              wantsLongDeliverable(operatorMessage) &&
              resolved.selection.provider === "wireline"
            ) {
              log.warn("director deliverable stub — retrying on sonnet", { userId: req.user.id });
              try {
                const retry = await planDirectorTurnResilient({
                  userId: req.user.id,
                  operatorMessage,
                  history,
                  fleet,
                  stats,
                  focusAgentId,
                  forceDeep: false,
                  shallowOnly: true,
                  modelSelection: { provider: "wireline", tier: "sonnet" },
                  deliverableGuidance: undefined,
                  designRenderFallback: false,
                });
                if (!isDirectorStubReply(retry.reply)) {
                  reply = retry.reply;
                  suggestions = retry.suggestions;
                  model = retry.model;
                  modelLabel = stitchDesignFallback ? DESIGN_LLM_MODEL_LABEL : retry.modelLabel;
                  modelProvider = stitchDesignFallback ? "wireline" : retry.modelProvider;
                  modelId = retry.modelId;
                  reasoning = stitchDesignFallback ? DESIGN_LLM_REASONING : retry.reasoning;
                  thinkingDurationMs = retry.thinkingDurationMs;
                  changes = retry.changes;
                  toolToggles = retry.toolToggles;
                  actions = retry.actions;
                  integrationJobs = retry.integrationJobs;
                  mode = retry.mode;
                  coachAgentId = retry.focusAgentId;
                  coachAgentName = retry.focusAgentName;
                  researchSources = retry.researchSources;
                }
              } catch (retryErr) {
                if (retryErr instanceof AppError) throw retryErr;
                log.error("director deliverable retry failed", {
                  error: getErrorMessage(retryErr),
                });
              }
            }
          }
        }
      }

      const turnPayload = await enrichDirectorTurnPayload(
        req.user.id,
        operatorMessage,
        {
          reply,
          suggestions,
          approvals,
          previews,
          clarifyingQuestions,
          changes,
          toolToggles,
          actions,
          integrationJobs,
          model,
          modelLabel,
          modelProvider,
          modelId,
          thinkingDurationMs,
          focusAgentId: coachAgentId,
          focusAgentName: coachAgentName,
          mode,
          researchSources,
          artifacts,
          stitchSession,
          stitchAssetsPending,
        },
        featureFlags,
      );

      reply = typeof turnPayload.reply === "string" ? turnPayload.reply : reply;
      previews = Array.isArray(turnPayload.previews) ? turnPayload.previews : previews;

      const insertResult = await insertDirectorReplyIfAbsent({
        userId: req.user.id,
        operatorMessage,
        reply,
        threadKey,
        reasoning: reasoning || null,
        metadata: packDirectorMetadata(buildDirectorMetadataFromTurn(turnPayload)),
      });

      if (insertResult !== "inserted" && operatorMessage) {
        const existing = await loadExistingDirectorTurnResponse(
          req.user.id,
          operatorMessage,
          threadKey,
        );
        if (existing) {
          const persisted = jsonFromPersistedDirectorTurn(existing);
          const { artifacts: latest } = await listDirectorArtifactsSafe(req.user.id, 40);
          return res.json({
            ...persisted,
            artifacts: filterDirectorArtifactsForThread(
              priorMessages.messages,
              latest.map((a) => withSignedUrl(req.user.id, a)),
            ),
            featureFlags,
            toolTelemetry,
          });
        }
      }

      const turnArtifacts = Array.isArray(turnPayload.artifacts) ? turnPayload.artifacts : [];
      if (turnArtifacts.length > 0) {
        artifacts = turnArtifacts;
      } else if (artifacts.length === 0) {
        const { artifacts: latest } = await listDirectorArtifactsSafe(req.user.id, 40);
        artifacts = latest.map((a) => withSignedUrl(req.user.id, a));
      }

      res.json({
        reply,
        suggestions,
        model,
        modelLabel,
        modelProvider,
        modelId,
        mode,
        focusAgentId: coachAgentId,
        focusAgentName: coachAgentName,
        changes,
        toolToggles,
        actions,
        integrationJobs,
        approvals,
        previews: turnPayload.previews ?? previews,
        artifacts: turnPayload.artifacts ?? artifacts,
        clarifyingQuestions,
        toolTelemetry,
        featureFlags,
        reasoning,
        thinkingDurationMs,
        researchSources,
        deliverableArtifact: turnPayload.deliverableArtifact,
        stitchSession,
        stitchAssetsPending,
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director POST failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to send message");
    }
  },
);

// POST /api/director/messages/stream — SSE streaming endpoint for real-time thinking display.
// Streams thinking chunks as they arrive from Claude, then emits the final reply.
router.post(
  "/api/director/messages/stream",
  authenticateEventStream,
  claudeRateLimiter,
  enforce24hSpendCap,
  enforceSpendCap,
  withAudit("director"),
  validateBody(directorStreamMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    let sseHandle: ReturnType<typeof createSseStream> | undefined;
    try {
      const operatorMessage = req.body.content.trim();
      const focusAgentId = String(req.body.focusAgentId || "").trim() || undefined;

      const sse = createSseStream(req, res);
      sseHandle = sse;
      writeSseBootstrap(sse);

      const streamAbort = new AbortController();
      sse.onClientDisconnect(() => streamAbort.abort());

      const resolved = await resolveDirectorModelSelection(
        req.user.id,
        req.body ?? {},
        loadDirectorChatModelPreference,
        req.user.email,
      );
      if (!resolved.ok) {
        sse.write("error", { message: resolved.error });
        sse.end();
        return;
      }
      const modelSelection = resolved.selection;
      if (!directorLlmConfigured(modelSelection)) {
        sse.write("error", {
          message:
            modelSelection.provider === "openrouter"
              ? "OpenRouter not configured"
              : "LLM not configured",
        });
        sse.end();
        return;
      }

      const threadKey = resolveRequestThreadKey(req);
      const [fleet, stats, priorMessages] = await Promise.all([
        loadFleetSafe(req.user.id),
        loadDirectorWeekStats(req.user.id),
        loadDirectorMessages(req.user.id, CLAUDE_CONTEXT_WINDOW, threadKey),
      ]);

      const focusAgentName = focusAgentId
        ? (fleet.find((a) => a.id === focusAgentId)?.name ?? undefined)
        : undefined;
      const routingPreview = previewDirectorStreamRouting({
        userId: req.user.id,
        operatorMessage,
        history: [],
        fleet,
        focusAgentId,
        focusAgentName,
        forceDeep: req.body?.forceDeep === true,
        modelSelection,
      });
      sse.write("meta", {
        model: routingPreview.model,
        modelLabel: routingPreview.modelLabel,
        modelProvider: routingPreview.modelProvider,
        modelId: routingPreview.modelId,
        deep: routingPreview.deep,
        mode: routingPreview.mode,
        focusAgentId: routingPreview.focusAgentId,
        focusAgentName: routingPreview.focusAgentName,
      });

      const history = priorMessages.messages.reverse().map((m) => ({
        role: m.role === "operator" ? ("operator" as const) : ("director" as const),
        content: m.content,
      }));

      await persistOperatorMessageIfNeeded(
        req.user.id,
        operatorMessage,
        priorMessages,
        req.body?.skipOperatorPersist === true,
        threadKey,
      );

      const featureFlags = loadDirectorFeatureFlags();

      if (
        featureFlags.toolExecution &&
        featureFlags.creativeTools &&
        isCreativeIntent(operatorMessage)
      ) {
        const creative = buildCreativeDirectorTurn(operatorMessage, history);
        const metadata = packDirectorMetadata(
          buildDirectorMetadataFromTurn({
            reply: creative.reply,
            approvals: creative.approvals,
            clarifyingQuestions: creative.clarifyingQuestions,
          }),
        );

        sse.write("meta", { model: "sonnet", deep: false, mode: "fleet" });
        sse.write("thinking_end", { thinking: "", durationMs: 0 });
        sse.write("done", {
          reply: creative.reply,
          approvals: creative.approvals,
          clarifyingQuestions: creative.clarifyingQuestions,
        });
        sse.end();
        void insertDirectorReplyIfAbsent({
          userId: req.user.id,
          operatorMessage,
          reply: creative.reply,
          threadKey,
          metadata,
        }).catch((err) =>
          log.error("director creative stream persist failed", {
            error: getErrorMessage(err),
            userId: req.user.id,
          }),
        );
        return;
      }

      let stitchMetaSent = false;
      const sendStitchMeta = () => {
        if (!stitchMetaSent) {
          stitchMetaSent = true;
          sse.write("meta", {
            model: "stitch",
            modelLabel: WIRELINE_STITCH_UI.modelLabel,
            modelProvider: "wireline",
            deep: false,
            mode: "fleet",
          });
          sse.write("thinking_start", {});
        }
      };

      let stitchDesignFallback: DesignLlmFallback | undefined;
      const stitchPath =
        featureFlags.designStudio && !focusAgentId
          ? await resolveDesignDirectorPath({
              userId: req.user.id,
              operatorMessage,
              history,
              stitchOptions: req.body?.stitchOptions,
              onProgress: (text) => {
                sendStitchMeta();
                sse.write("thinking_chunk", { text });
              },
              signal: streamAbort.signal,
            })
          : { kind: "none" as const };

      if (stitchPath.kind === "design") {
        const stitchTurn = stitchPath.turn;
        sendStitchMeta();
        sse.write("thinking_end", {
          thinking: stitchTurn.thinkingSummary,
          durationMs: stitchTurn.durationMs,
        });
        const donePayload: Record<string, unknown> = {
          reply: stitchTurn.reply,
          previews: stitchTurn.previews,
          artifacts: stitchTurn.artifacts,
          clarifyingQuestions: stitchTurn.clarifyingQuestions,
          model: "sonnet",
          modelLabel: WIRELINE_STITCH_UI.modelLabel,
          modelProvider: "wireline",
          mode: "fleet",
          thinkingDurationMs: stitchTurn.durationMs,
          reasoning: stitchTurn.thinkingSummary,
        };
        await finalizeDirectorStreamTurn(
          sse,
          req.user.id,
          operatorMessage,
          stitchTurn.reply,
          donePayload,
          stitchTurn.thinkingSummary,
          featureFlags,
          threadKey,
        );
        return;
      }

      if (stitchPath.kind === "llm-fallback") {
        stitchDesignFallback = stitchPath.fallback;
        sse.write("thinking_start", {});
        sse.write("thinking_chunk", { text: DESIGN_LLM_REASONING });
        sse.write("thinking_end", {
          thinking: DESIGN_LLM_REASONING,
          durationMs: 0,
        });
      }

      const streamCtx = await buildDirectorStreamContext({
        userId: req.user.id,
        operatorMessage,
        history,
        fleet,
        focusAgentId,
        forceDeep: req.body?.forceDeep === true,
        modelSelection,
        deliverableGuidance: stitchDesignFallback?.deliverableGuidance,
        designRenderFallback: Boolean(stitchDesignFallback),
      });

      const streamMeta = directorStreamMetaModel(streamCtx);
      sse.write("meta", {
        model: streamMeta.model,
        modelLabel: stitchDesignFallback ? DESIGN_LLM_MODEL_LABEL : streamCtx.modelLabel,
        modelProvider: streamCtx.llmProvider,
        modelId: streamCtx.modelId,
        deep: streamMeta.deep,
        mode: streamCtx.mode,
        focusAgentId: streamCtx.focusAgentId,
        focusAgentName: streamCtx.focusAgentName,
      });

      let streamFinalized = false;
      try {
        const streamWireline = streamCtx.llmProvider === "wireline";
        const { result, thinking, thinkingDurationMs } = await runDirectorStreamLlm(
          streamCtx,
          {
            onThinkingStart: streamWireline ? () => sse.write("thinking_start", {}) : undefined,
            onThinkingChunk: streamWireline
              ? (text) => sse.write("thinking_chunk", { text })
              : undefined,
            onThinkingEnd: streamWireline
              ? (fullText, durationMs) =>
                  sse.write("thinking_end", { thinking: fullText, durationMs })
              : undefined,
            onResult: (r) => {
              const rec = r as Record<string, unknown>;
              const preview =
                typeof rec.reply === "string"
                  ? { reply: rec.reply }
                  : { reply: typeof r === "string" ? r : "" };
              sse.write("reply", preview);
            },
          },
          { signal: streamAbort.signal },
        );

        let normalized = streamCtx.normalize((result || {}) as Record<string, unknown>);
        let reply = normalized.reply || "";

        if (
          !stitchDesignFallback &&
          isDirectorStubReply(reply) &&
          wantsLongDeliverable(operatorMessage) &&
          streamCtx.llmProvider === "wireline"
        ) {
          log.warn("director stream deliverable stub — retrying on sonnet", {
            userId: req.user.id,
          });
          const retry = await planDirectorTurnResilient({
            userId: req.user.id,
            operatorMessage,
            history,
            fleet,
            stats,
            focusAgentId,
            forceDeep: false,
            shallowOnly: true,
            modelSelection: { provider: "wireline", tier: "sonnet" },
            deliverableGuidance: undefined,
            designRenderFallback: false,
          });
          if (!isDirectorStubReply(retry.reply)) {
            normalized = {
              mode: retry.mode,
              reply: retry.reply,
              suggestions: retry.suggestions,
              changes: retry.changes,
              toolToggles: retry.toolToggles,
              actions: retry.actions,
              integrationJobs: retry.integrationJobs,
              focusAgentId: retry.focusAgentId,
              focusAgentName: retry.focusAgentName,
              model: retry.model,
              modelLabel: stitchDesignFallback ? DESIGN_LLM_MODEL_LABEL : retry.modelLabel,
              modelProvider: stitchDesignFallback ? "wireline" : retry.modelProvider,
              modelId: retry.modelId,
            };
            reply = retry.reply;
          }
        }

        if (isDirectorStubReply(reply)) {
          const existing = await loadExistingDirectorTurnResponse(req.user.id, operatorMessage);
          if (existing) {
            reply = existing.content;
            const meta = existing.metadata;
            normalized = {
              mode: meta.mode ?? normalized.mode,
              reply: existing.content,
              suggestions: meta.suggestions ?? normalized.suggestions,
              changes: meta.proposals?.changes ?? normalized.changes,
              toolToggles: meta.proposals?.toolToggles ?? normalized.toolToggles,
              actions: meta.proposals?.actions ?? normalized.actions,
              integrationJobs: meta.proposals?.integrationJobs ?? normalized.integrationJobs,
              focusAgentId: meta.coachAgentId ?? normalized.focusAgentId,
              focusAgentName: meta.coachAgentName ?? normalized.focusAgentName,
              model: meta.model ?? normalized.model,
              modelLabel: meta.modelLabel ?? normalized.modelLabel,
              modelProvider: meta.modelProvider ?? normalized.modelProvider,
              modelId: meta.modelId ?? normalized.modelId,
            };
          } else if (wantsLongDeliverable(operatorMessage) && !stitchDesignFallback) {
            sse.write("error", {
              message: "Could not generate a complete deliverable — try again in a moment.",
            });
            sse.end();
            return;
          }
        }

        let donePayload: Record<string, unknown> = {
          reply,
          suggestions: normalized.suggestions,
          changes: normalized.changes,
          toolToggles: normalized.toolToggles,
          actions: normalized.actions,
          integrationJobs: normalized.integrationJobs,
          mode: normalized.mode,
          focusAgentId: normalized.focusAgentId,
          focusAgentName: normalized.focusAgentName,
          model: normalized.model,
          modelLabel: stitchDesignFallback
            ? DESIGN_LLM_MODEL_LABEL
            : (normalized.modelLabel ?? streamCtx.modelLabel),
          modelProvider: stitchDesignFallback ? "wireline" : streamCtx.llmProvider,
          modelId: streamCtx.modelId,
          reasoning: stitchDesignFallback ? DESIGN_LLM_REASONING : thinking,
          thinkingDurationMs,
          researchSources: streamCtx.researchSources,
          ...(stitchDesignFallback ? { artifacts: stitchDesignFallback.artifacts } : {}),
        };

        donePayload = await enrichDirectorTurnPayload(
          req.user.id,
          operatorMessage,
          donePayload,
          featureFlags,
        );
        reply = typeof donePayload.reply === "string" ? donePayload.reply : reply;

        streamFinalized = await finalizeDirectorStreamTurn(
          sse,
          req.user.id,
          operatorMessage,
          reply,
          donePayload,
          thinking,
          featureFlags,
          threadKey,
        );
      } catch (e) {
        if (e instanceof AppError) throw e;
        if (streamAbort.signal.aborted) {
          log.info("director stream aborted by client", { userId: req.user.id });
          if (!streamFinalized) sse.end();
          return;
        }
        if (streamFinalized) {
          log.info("director stream error after finalize — skipping fallback", {
            userId: req.user.id,
            error: getErrorMessage(e),
          });
          return;
        }
        if (await emitStreamDoneFromPersisted(sse, req.user.id, operatorMessage, threadKey)) {
          log.info("director stream recovered from persisted turn", { userId: req.user.id });
          return;
        }
        log.error("director stream failed", { error: getErrorMessage(e) });
        const deliverableTurn = wantsLongDeliverable(operatorMessage) && !stitchDesignFallback;
        try {
          const turn = await planDirectorTurnResilient({
            userId: req.user.id,
            operatorMessage,
            history,
            fleet,
            stats,
            focusAgentId,
            forceDeep: deliverableTurn ? false : req.body?.forceDeep === true,
            shallowOnly: deliverableTurn,
            modelSelection: stitchDesignFallback
              ? { provider: "wireline", tier: "opus" }
              : deliverableTurn
                ? { provider: "wireline", tier: "sonnet" }
                : modelSelection,
            deliverableGuidance: stitchDesignFallback?.deliverableGuidance,
            designRenderFallback: Boolean(stitchDesignFallback),
          });
          if (
            isDirectorStubReply(turn.reply) &&
            (await emitStreamDoneFromPersisted(sse, req.user.id, operatorMessage, threadKey))
          ) {
            return;
          }
          sse.write("thinking_end", {
            thinking: turn.reasoning ?? "",
            durationMs: turn.thinkingDurationMs ?? 0,
          });
          await finalizeDirectorStreamTurn(
            sse,
            req.user.id,
            operatorMessage,
            turn.reply,
            directorTurnToStreamDone(turn),
            turn.reasoning,
            featureFlags,
            threadKey,
          );
        } catch (fallbackErr) {
          if (fallbackErr instanceof AppError) throw fallbackErr;
          log.error("director stream fallback failed", {
            error: getErrorMessage(fallbackErr),
          });
          if (await emitStreamDoneFromPersisted(sse, req.user.id, operatorMessage, threadKey)) {
            return;
          }
          sse.write("error", { message: "Failed to generate response" });
          sse.end();
        }
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      const errMsg = getErrorMessage(e);
      log.error("director stream setup failed", { error: errMsg });
      if (sseHandle && !sseHandle.clientDisconnected) {
        sseHandle.write("error", { message: "Failed to start stream" });
        sseHandle.end();
        return;
      }
      if (!res.headersSent) {
        res.status(500).json({
          code: "INTERNAL_ERROR",
          error: "Failed to start stream",
          detail: errMsg,
        });
      }
    }
  },
);

router.post(
  "/api/director/execute",
  authenticateUser,
  validateBody(directorExecuteSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const kind = req.body.kind;
      if (kind === "comms") {
        const action = req.body.action as DirectorProposedAction;
        const result = await executeDirectorCommsAction(req.user.id, action, {
          hasExpressWrittenConsent: !!req.body.hasExpressWrittenConsent,
        });
        if (!result.success) throw AppError.fromHttpStatus(400, String(result.error || "Failed"));
        return res.json(result);
      }
      const job = req.body.job as DirectorIntegrationJob;
      const result = await executeDirectorIntegrationJob(req.user.id, job);
      if (!result.success) throw AppError.fromHttpStatus(400, String(result.error || "Failed"));
      return res.json(result);
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director execute failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Execution failed");
    }
  },
);

router.post(
  "/api/director/files",
  authenticateUser,
  claudeRateLimiter,
  validateBody(pdfUploadSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await ensureDirectorSchema();
      const { pdfBase64, fileName } = req.body;
      try {
        const head = Buffer.from(pdfBase64.slice(0, 16), "base64").toString("utf8", 0, 5);
        if (!head.startsWith("%PDF")) {
          throw AppError.fromHttpStatus(400, "File does not look like a valid PDF.");
        }
      } catch {
        throw AppError.fromHttpStatus(400, "Malformed base64 payload.");
      }

      const { knowledgeFromDocument } = await import("../lib/claude-brain");
      const result = await knowledgeFromDocument({
        pdfBase64,
        fileName: typeof fileName === "string" ? fileName.slice(0, 255) : undefined,
        maxEntries: 12,
      });

      const entries: Array<{ fact?: string; content?: string }> = Array.isArray(
        (result as { entries?: unknown }).entries,
      )
        ? (result as { entries: Array<{ fact?: string; content?: string }> }).entries
        : [];
      const snippets = entries
        .map((e) => (e.content ?? e.fact)?.trim())
        .filter(Boolean)
        .slice(0, 6);

      const label = typeof fileName === "string" ? fileName : "document";
      const operatorNote = `[Attached PDF: ${label}]`;
      await insertDirectorMessage({
        userId: req.user.id,
        role: "operator",
        content: operatorNote,
      });

      const reply =
        snippets.length > 0
          ? `I read **${label}** and extracted ${snippets.length} key point${snippets.length === 1 ? "" : "s"}:\n\n${snippets.map((s, i) => `${i + 1}. ${s}`).join("\n\n")}\n\nWant me to turn this into agent config, a playbook, or fleet actions?`
          : `I read **${label}** but didn't find structured knowledge to extract. Paste a URL or tell me what to pull from it.`;

      await insertDirectorMessage({
        userId: req.user.id,
        role: "director",
        content: reply,
      });

      res.json({ ok: true, inserted: snippets.length, reply });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director file upload failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to process PDF");
    }
  },
);

router.post(
  "/api/director/messages/:id/resolve",
  authenticateUser,
  validateBody(directorProposalResolveSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const messageId = String(req.params.id || "").trim();
      if (!/^\d+$/.test(messageId)) {
        throw AppError.fromHttpStatus(400, "Invalid message id");
      }
      const { key, state } = req.body as { key: string; state: "done" | "dismissed" };
      const ok = await patchDirectorMessageResolved(req.user.id, messageId, key, state);
      if (!ok) throw AppError.fromHttpStatus(404, "Message not found");
      res.json({ success: true, key, state });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director proposal resolve failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to save proposal state");
    }
  },
);

router.delete(
  "/api/director/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await ensureDirectorSchema();
      const threadKey = resolveRequestThreadKey(req);
      await drizzle
        .delete(schema.directorConversationMessages)
        .where(
          and(
            eq(schema.directorConversationMessages.userId, req.user.id),
            eq(schema.directorConversationMessages.threadKey, threadKey),
          ),
        );
      const artifactsCleared =
        threadKey === DIRECTOR_THREAD_KEY ? await clearDirectorArtifacts(req.user.id) : 0;
      res.json({ cleared: true, artifactsCleared });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director clear failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to clear Director thread");
    }
  },
);

router.get(
  "/api/director/artifacts/:id/signed-url",
  directorArtifactDownloadLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await ensureDirectorSchema();
      const artifactId = String(req.params.id || "").trim();
      if (!artifactId) throw AppError.fromHttpStatus(400, "Artifact id required");

      const loaded = await loadDirectorArtifactData({ artifactId, userId: req.user.id });
      if (!loaded) throw AppError.fromHttpStatus(404, "Artifact not found");

      const inline = String(req.query.inline || "") === "1";
      const url = inline
        ? buildSignedPreviewUrl("/api/director/artifacts", artifactId, req.user.id)
        : buildSignedDownloadUrl("/api/director/artifacts", artifactId, req.user.id);

      res.json({
        url,
        artifactId,
        mimeType: loaded.artifact.mimeType,
        inline,
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director artifact signed-url failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to mint artifact preview URL");
    }
  },
);

router.get(
  "/api/director/artifacts/:id/download",
  directorArtifactDownloadLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await ensureDirectorSchema();
      const artifactId = String(req.params.id || "").trim();
      const exp = String(req.query.exp || "");
      const sig = String(req.query.sig || "");
      if (!verifySignedDownloadToken(artifactId, req.user.id, exp, sig)) {
        throw AppError.fromHttpStatus(403, "Invalid or expired download signature");
      }

      const loaded = await loadDirectorArtifactBase64({ artifactId, userId: req.user.id });
      if (!loaded) throw AppError.fromHttpStatus(404, "Artifact not found");

      const inline = String(req.query.inline || "") === "1";
      res.setHeader("Content-Type", loaded.artifact.mimeType);
      res.setHeader("Content-Length", String(loaded.artifact.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        inline
          ? `inline; filename="${loaded.artifact.name}"`
          : `attachment; filename="${loaded.artifact.name}"`,
      );
      if (inline && loaded.artifact.mimeType.startsWith("text/html")) {
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
      }
      streamBase64ToResponse(loaded.base64Data, res);
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("director artifact download failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to download artifact");
    }
  },
);

export default router;
