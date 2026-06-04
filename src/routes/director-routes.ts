/**
 * Director routes — account-level strategist chat + creative artifact tooling.
 */
import express, { type Response } from "express";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { and, eq, gte, sql } from "drizzle-orm";
import { listAgentSummariesForUser } from "../lib/agents-store";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser, authenticateEventStream } from "../middleware/auth";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import { type DirectorFleetAgent } from "../lib/director-planner";
import {
  executeDirectorCommsAction,
  executeDirectorIntegrationJob,
} from "../lib/director-executor";
import type { DirectorIntegrationJob, DirectorProposedAction } from "../lib/director-fleet-plan";
import { planDirectorTurn, buildDirectorStreamContext } from "../lib/director-turn";
import { runStructuredStream } from "../lib/claude-structured";
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
  listDirectorArtifacts,
  loadDirectorArtifactData,
  storeDirectorArtifact,
  verifySignedDownloadToken,
} from "../lib/director-artifacts";
import {
  ensureDirectorSchema,
  insertDirectorMessage,
  listDirectorArtifactsSafe,
  loadDirectorMessages,
} from "../lib/director-store";

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
    log.warn("director fleet load failed", { error: getErrorMessage(e), userId });
    return [];
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
      const { messages, degraded: messagesDegraded } = await loadDirectorMessages(
        req.user.id,
        MAX_THREAD_LENGTH,
      );
      const degraded = messagesDegraded || artifactsDegraded;

      res.json({
        fleet,
        featureFlags: loadDirectorFeatureFlags(),
        artifacts: artifacts.map((a) => withSignedUrl(req.user.id, a)),
        degraded: degraded || undefined,
        messages: messages.reverse().map((m) => {
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
            thinkingDurationMs: meta.thinkingDurationMs,
            coachAgentId: meta.coachAgentId,
            coachAgentName: meta.coachAgentName,
            mode: meta.mode,
          };
        }),
      });
    } catch (e) {
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

router.post(
  "/api/director/messages",
  authenticateUser,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const featureFlags = loadDirectorFeatureFlags();
      const operatorMessage = String(req.body?.content || "").trim();
      const focusAgentId = String(req.body?.focusAgentId || "").trim() || undefined;
      const approval = req.body?.approval as DirectorApprovalRequest | undefined;

      if (!operatorMessage && !approval) {
        return res.status(400).json({ error: "Message content required" });
      }
      if (operatorMessage.length > 4000) {
        return res.status(400).json({ error: "Message too long — keep under 4000 chars" });
      }

      const fleet = await loadFleetSafe(req.user.id);

      let stats: { calls7d?: number; bookings7d?: number } | undefined;
      try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [[calls], [bookings]] = await Promise.all([
          drizzle
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.callLogs)
            .where(
              and(eq(schema.callLogs.userId, req.user.id), gte(schema.callLogs.createdAt, since)),
            ),
          drizzle
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.appointments)
            .where(
              and(
                eq(schema.appointments.userId, req.user.id),
                gte(schema.appointments.createdAt, since),
              ),
            ),
        ]);
        stats = { calls7d: calls?.n ?? 0, bookings7d: bookings?.n ?? 0 };
      } catch {
        stats = undefined;
      }

      const priorMessages = await loadDirectorMessages(req.user.id, CLAUDE_CONTEXT_WINDOW);

      const history = priorMessages.messages.reverse().map((m) => ({
        role: m.role === "operator" ? ("operator" as const) : ("director" as const),
        content: m.content,
      }));

      if (operatorMessage) {
        const skipPersist = req.body?.skipOperatorPersist === true;
        const last = priorMessages.messages[0];
        const duplicatePending =
          skipPersist && last?.role === "operator" && last.content.trim() === operatorMessage;
        if (!duplicatePending) {
          await insertDirectorMessage({
            userId: req.user.id,
            role: "operator",
            content: operatorMessage,
          });
        }
      }

      let reply = "";
      let suggestions: unknown[] = [];
      let model: "sonnet" | "opus" = "sonnet";
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
        isCreativeIntent(operatorMessage)
      ) {
        const creative = buildCreativeDirectorTurn(operatorMessage, history);
        reply = creative.reply;
        approvals = creative.approvals;
        clarifyingQuestions = creative.clarifyingQuestions;
      } else if (!process.env.ANTHROPIC_API_KEY) {
        reply =
          "I can't respond right now — the LLM isn't configured. Your message is saved; try again later.";
      } else {
        try {
          const turn = await planDirectorTurn({
            userId: req.user.id,
            operatorMessage,
            history,
            fleet,
            stats,
            focusAgentId,
          });
          reply = turn.reply;
          suggestions = turn.suggestions;
          model = turn.model;
          reasoning = turn.reasoning;
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
          log.error("director planner failed", { error: getErrorMessage(e) });
          reply =
            "Sorry — I'm having trouble responding right now. Your message is saved; try again in a moment.";
        }
      }

      await insertDirectorMessage({
        userId: req.user.id,
        role: "director",
        content: reply,
        reasoning: reasoning || null,
        metadata: packDirectorMetadata(
          buildDirectorMetadataFromTurn({
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
            thinkingDurationMs,
            focusAgentId: coachAgentId,
            focusAgentName: coachAgentName,
            mode,
            researchSources,
          }),
        ),
      });

      if (artifacts.length === 0) {
        const { artifacts: latest } = await listDirectorArtifactsSafe(req.user.id, 40);
        artifacts = latest.map((a) => withSignedUrl(req.user.id, a));
      }

      res.json({
        reply,
        suggestions,
        model,
        mode,
        focusAgentId: coachAgentId,
        focusAgentName: coachAgentName,
        changes,
        toolToggles,
        actions,
        integrationJobs,
        approvals,
        previews,
        artifacts,
        clarifyingQuestions,
        toolTelemetry,
        featureFlags,
        reasoning,
        thinkingDurationMs,
        researchSources,
      });
    } catch (e) {
      log.error("director POST failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to send message" });
    }
  },
);

// POST /api/director/messages/stream — SSE streaming endpoint for real-time thinking display.
// Streams thinking chunks as they arrive from Claude, then emits the final reply.
router.post(
  "/api/director/messages/stream",
  authenticateEventStream,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorMessage = String(req.body?.content || "").trim();
      const focusAgentId = String(req.body?.focusAgentId || "").trim() || undefined;
      if (!operatorMessage) {
        return res.status(400).json({ error: "Message content required" });
      }
      if (operatorMessage.length > 4000) {
        return res.status(400).json({ error: "Message too long" });
      }
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "LLM not configured" });
      }

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Content-Encoding", "none");

      const fleet = await loadFleetSafe(req.user.id);

      // Load history for context
      const priorMessages = await loadDirectorMessages(req.user.id, CLAUDE_CONTEXT_WINDOW);

      const history = priorMessages.messages.reverse().map((m) => ({
        role: m.role === "operator" ? ("operator" as const) : ("director" as const),
        content: m.content,
      }));

      // Save operator message
      await insertDirectorMessage({
        userId: req.user.id,
        role: "operator",
        content: operatorMessage,
      });

      const featureFlags = loadDirectorFeatureFlags();

      let closed = false;
      req.on("close", () => {
        closed = true;
      });

      const writeSse = (event: string, data: unknown) => {
        if (closed) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

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

        await insertDirectorMessage({
          userId: req.user.id,
          role: "director",
          content: creative.reply,
          metadata,
        });

        writeSse("meta", { model: "sonnet", deep: false, mode: "fleet" });
        writeSse("thinking_end", { thinking: "", durationMs: 0 });
        writeSse("done", {
          reply: creative.reply,
          approvals: creative.approvals,
          clarifyingQuestions: creative.clarifyingQuestions,
        });
        if (!closed) res.end();
        return;
      }

      const streamCtx = await buildDirectorStreamContext({
        userId: req.user.id,
        operatorMessage,
        history,
        fleet,
        focusAgentId,
      });

      res.write(
        `event: meta\ndata: ${JSON.stringify({
          model: streamCtx.model.includes("opus") ? "opus" : "sonnet",
          deep: streamCtx.deepThink,
          mode: streamCtx.mode,
          focusAgentId: streamCtx.focusAgentId,
          focusAgentName: streamCtx.focusAgentName,
        })}\n\n`,
      );

      try {
        const { result, thinking, thinkingDurationMs } = await runStructuredStream(
          {
            system: streamCtx.system,
            user: streamCtx.user,
            tool: streamCtx.tool,
            model: streamCtx.model,
            deepThink: streamCtx.deepThink,
            maxTokens: streamCtx.maxTokens,
          },
          {
            onThinkingStart: () => writeSse("thinking_start", {}),
            onThinkingChunk: (text) => writeSse("thinking_chunk", { text }),
            onThinkingEnd: (fullText, durationMs) =>
              writeSse("thinking_end", { thinking: fullText, durationMs }),
            onResult: (r) => writeSse("reply", r),
          },
        );

        const normalized = streamCtx.normalize((result || {}) as Record<string, unknown>);
        const reply = normalized.reply || "";
        const donePayload = {
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
          reasoning: thinking,
          thinkingDurationMs,
          researchSources: streamCtx.researchSources,
        };

        await insertDirectorMessage({
          userId: req.user.id,
          role: "director",
          content: reply || "(empty)",
          reasoning: thinking || null,
          metadata: packDirectorMetadata(buildDirectorMetadataFromTurn(donePayload)),
        });

        writeSse("done", donePayload);
      } catch (e) {
        log.error("director stream failed", { error: getErrorMessage(e) });
        writeSse("error", { message: "Failed to generate response" });
      }

      if (!closed) res.end();
    } catch (e) {
      const errMsg = getErrorMessage(e);
      log.error("director stream setup failed", { error: errMsg });
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to start stream", detail: errMsg });
      }
    }
  },
);

router.post(
  "/api/director/execute",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const kind = String(req.body?.kind || "");
      if (kind === "comms") {
        const action = req.body?.action as DirectorProposedAction | undefined;
        if (!action?.kind) return res.status(400).json({ error: "Invalid action" });
        const result = await executeDirectorCommsAction(req.user.id, action, {
          hasExpressWrittenConsent: !!req.body?.hasExpressWrittenConsent,
        });
        if (!result.success) return res.status(400).json({ error: result.error || "Failed" });
        return res.json(result);
      }
      if (kind === "integration") {
        const job = req.body?.job as DirectorIntegrationJob | undefined;
        if (!job?.tool) return res.status(400).json({ error: "Invalid integration job" });
        const result = await executeDirectorIntegrationJob(req.user.id, job);
        if (!result.success) return res.status(400).json({ error: result.error || "Failed" });
        return res.json(result);
      }
      return res.status(400).json({ error: "kind must be comms or integration" });
    } catch (e) {
      log.error("director execute failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Execution failed" });
    }
  },
);

router.post(
  "/api/director/files",
  authenticateUser,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await ensureDirectorSchema();
      const { pdfBase64, fileName } = req.body ?? {};
      if (!pdfBase64 || typeof pdfBase64 !== "string") {
        return res.status(400).json({ error: "pdfBase64 required" });
      }
      if (pdfBase64.length > 40 * 1024 * 1024) {
        return res.status(413).json({ error: "File exceeds 30MB. Split it up." });
      }
      try {
        const head = Buffer.from(pdfBase64.slice(0, 16), "base64").toString("utf8", 0, 5);
        if (!head.startsWith("%PDF")) {
          return res.status(400).json({ error: "File does not look like a valid PDF." });
        }
      } catch {
        return res.status(400).json({ error: "Malformed base64 payload." });
      }

      const { knowledgeFromDocument } = await import("../lib/claude-brain");
      const result = await knowledgeFromDocument({
        pdfBase64,
        fileName: typeof fileName === "string" ? fileName.slice(0, 255) : undefined,
        maxEntries: 12,
      });

      const entries: Array<{ content: string }> = Array.isArray(
        (result as { entries?: unknown }).entries,
      )
        ? ((result as { entries: unknown[] }).entries as Array<{ content: string }>)
        : [];
      const snippets = entries
        .map((e) => e?.content?.trim())
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
      log.error("director file upload failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to process PDF" });
    }
  },
);

router.delete(
  "/api/director/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await ensureDirectorSchema();
      await drizzle
        .delete(schema.directorConversationMessages)
        .where(eq(schema.directorConversationMessages.userId, req.user.id));
      res.json({ cleared: true });
    } catch (e) {
      log.error("director clear failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to clear Director thread" });
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
        return res.status(403).json({ error: "Invalid or expired download signature" });
      }

      const loaded = await loadDirectorArtifactData({ artifactId, userId: req.user.id });
      if (!loaded) return res.status(404).json({ error: "Artifact not found" });

      res.setHeader("Content-Type", loaded.artifact.mimeType);
      res.setHeader("Content-Length", String(loaded.artifact.sizeBytes));
      res.setHeader("Content-Disposition", `attachment; filename="${loaded.artifact.name}"`);
      res.send(loaded.data);
    } catch (e) {
      log.error("director artifact download failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to download artifact" });
    }
  },
);

export default router;
