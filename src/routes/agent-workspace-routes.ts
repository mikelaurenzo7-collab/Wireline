import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
/**
 * Agent Workspace — per-agent Account Holder chat (legacy surface).
 *
 * @deprecated Merchants use `/chat` + Director Coach mode. Routes kept for
 * PDF → agent knowledge ingest, founder broadcast, and API compatibility.
 *
 * Memory model: thread history + recent call summaries injected each turn.
 */
import express, { type Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser, authenticateEventStream } from "../middleware/auth";
import { claudeRateLimiter, smsRateLimit } from "../middleware/api-rate-limits";
import { validateBody, workspaceMessageSchema, pdfUploadSchema } from "../lib/api-validation";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import { publicAiStreamFailureMessage } from "../lib/ai-stream-errors";
import { findOwnedAgentProfile } from "../lib/agent-ownership";
import {
  planWorkspace,
  WORKSPACE_FIELDS,
  WORKSPACE_AMBIENT_OPTIONS,
  WORKSPACE_VIBE_OPTIONS,
  type WorkspaceFieldKey,
} from "../lib/workspace-planner";
import {
  isAgentToolName,
  resolveAgentTools,
  normalizeEnabledTools,
} from "../lib/agent-capabilities";
import { executeAction } from "../lib/action-engine";
import { runStructuredStream } from "../lib/ai-structured";
import { isRuntimeAvailable } from "../lib/ai-client";
import { withAudit } from "../middleware/audit-middleware";
import { enforceSpendCap } from "../lib/spend-guards";

const router = express.Router();

// Hard cap on stored history per agent — keeps the LLM payload bounded
// + storage manageable. Most account holders won't get near this. When the
// cap is hit, oldest rows are silently pruned on the next write.
const MAX_THREAD_LENGTH = 200;
// How many messages we feed back to Claude as conversational context.
// Older than this is still in the DB (visible in the UI) but doesn't
// influence the agent's response. Keeps token cost predictable.
const CLAUDE_CONTEXT_WINDOW = 40;

// GET /api/agents/:id/workspace/messages — load thread history.
router.get(
  "/api/agents/:id/workspace/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const [agent] = await drizzle
        .select({
          id: schema.agents.id,
          name: schema.agents.name,
          role: schema.agents.role,
          enabledTools: schema.agents.enabledTools,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      const messages = await drizzle
        .select()
        .from(schema.agentConversationMessages)
        .where(
          and(
            eq(schema.agentConversationMessages.agentId, agentId),
            eq(schema.agentConversationMessages.userId, req.user.id),
          ),
        )
        .orderBy(desc(schema.agentConversationMessages.createdAt))
        .limit(MAX_THREAD_LENGTH);

      // Return newest-last so the UI can append directly. We also surface
      // the agent's resolved capabilities so the chat can render its
      // "Connectors" panel without a second round-trip.
      res.json({
        agent: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          enabledTools: resolveAgentTools(agent.role ?? undefined, agent.enabledTools),
        },
        messages: messages.reverse().map((m) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          reasoning: m.reasoning || undefined,
          createdAt: m.createdAt,
        })),
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("workspace messages fetch failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load workspace messages");
    }
  },
);

// POST /api/agents/:id/workspace/messages — Account Holder sends, agent replies.
router.post(
  "/api/agents/:id/workspace/messages",
  authenticateUser,
  // Per-user throttle (60/min) so a spammy Account Holder can't run up model
  // cost — cheaper + safer than downgrading the model's intelligence.
  claudeRateLimiter,
  // Composer turns reach a paid model — they must respect the tenant's hard
  // cap and land in auditLog.costUsd like every other AI surface, or this
  // becomes invisible COGS the spend guards can't see.
  enforceSpendCap,
  withAudit("workspace"),
  validateBody(workspaceMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const userMessage = req.body.content.trim();

      // Load agent + current config (the planner proposes changes against
      // the live values) + recent call context.
      const [agent] = await drizzle
        .select({
          id: schema.agents.id,
          name: schema.agents.name,
          role: schema.agents.role,
          archetype: schema.agents.archetype,
          personalityVibe: schema.agents.personalityVibe,
          firstMessage: schema.agents.firstMessage,
          emailAgentTone: schema.agents.emailAgentTone,
          emailSignature: schema.agents.emailSignature,
          outOfHoursMessage: schema.agents.outOfHoursMessage,
          transferPhone: schema.agents.transferPhone,
          escalationEmail: schema.agents.escalationEmail,
          escalationPhone: schema.agents.escalationPhone,
          enabledTools: schema.agents.enabledTools,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      const recentCalls = await drizzle
        .select({
          summary: schema.callLogs.summary,
          sentiment: schema.callLogs.sentiment,
          intent: schema.callLogs.intentLabel,
        })
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.agentId, agentId), eq(schema.callLogs.userId, req.user.id)))
        .orderBy(desc(schema.callLogs.createdAt))
        .limit(5);

      // Load thread history for the LLM context (most recent first → reverse for chronological order).
      const priorMessages = await drizzle
        .select()
        .from(schema.agentConversationMessages)
        .where(
          and(
            eq(schema.agentConversationMessages.agentId, agentId),
            eq(schema.agentConversationMessages.userId, req.user.id),
          ),
        )
        .orderBy(desc(schema.agentConversationMessages.createdAt))
        .limit(CLAUDE_CONTEXT_WINDOW);

      const history = priorMessages.reverse().map((m) => ({
        // Accept legacy "operator" rows until migration 0108 backfill lands everywhere.
        role:
          m.role === "Account Holder" || m.role === "operator"
            ? ("Account Holder" as const)
            : ("agent" as const),
        content: m.content,
      }));

      // Persist the Account Holder's message immediately so it survives any LLM failure downstream.
      await drizzle.insert(schema.agentConversationMessages).values({
        userId: req.user.id,
        agentId,
        role: "Account Holder",
        content: userMessage,
      });

      let reply: string;
      let changes: unknown[] = [];
      let toolToggles: unknown[] = [];
      let actions: unknown[] = [];
      let reasoning: string | undefined;
      let thinkingDurationMs: number | undefined;

      if (!isRuntimeAvailable()) {
        reply =
          "I can't respond right now — the LLM isn't configured. Your message is saved; try again later.";
      } else {
        try {
          const plan = await planWorkspace({
            userMessage,
            history,
            agent,
            recentCalls,
          });
          reply = plan.reply;
          changes = plan.changes;
          toolToggles = plan.toolToggles;
          actions = plan.actions;
          reasoning = plan.reasoning;
          thinkingDurationMs = plan.thinkingDurationMs;
        } catch (e) {
          if (e instanceof AppError) throw e;
          log.error("workspace planner failed", { error: getErrorMessage(e), agentId });
          reply =
            "Sorry — I'm having trouble responding right now. Your message is saved; try again in a moment.";
        }
      }

      await drizzle.insert(schema.agentConversationMessages).values({
        userId: req.user.id,
        agentId,
        role: "agent",
        content: reply,
        reasoning: reasoning || null,
      });

      res.json({ reply, changes, toolToggles, actions, reasoning, thinkingDurationMs });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("workspace POST failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to send message");
    }
  },
);

// POST /api/agents/:id/workspace/messages/stream — SSE streaming endpoint.
// Streams thinking chunks as they arrive from Claude, then emits the final reply.
router.post(
  "/api/agents/:id/workspace/messages/stream",
  authenticateEventStream,
  claudeRateLimiter,
  enforceSpendCap,
  withAudit("workspace"),
  validateBody(workspaceMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const userMessage = req.body.content.trim();
      if (!isRuntimeAvailable()) {
        throw AppError.fromHttpStatus(503, "LLM not configured");
      }

      const [agent] = await drizzle
        .select({
          id: schema.agents.id,
          name: schema.agents.name,
          role: schema.agents.role,
          archetype: schema.agents.archetype,
          enabledTools: schema.agents.enabledTools,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      const { createSseStream, writeSseBootstrap } = await import("../lib/sse-stream");
      const sse = createSseStream(req, res);
      writeSseBootstrap(sse, { agentId, agentName: agent.name });

      // Load history
      const priorMessages = await drizzle
        .select()
        .from(schema.agentConversationMessages)
        .where(
          and(
            eq(schema.agentConversationMessages.agentId, agentId),
            eq(schema.agentConversationMessages.userId, req.user.id),
          ),
        )
        .orderBy(desc(schema.agentConversationMessages.createdAt))
        .limit(CLAUDE_CONTEXT_WINDOW);

      const history = priorMessages.reverse().map((m) => ({
        role:
          m.role === "Account Holder" || m.role === "operator"
            ? ("Account Holder" as const)
            : ("agent" as const),
        content: m.content,
      }));

      // Persist Account Holder message
      await drizzle.insert(schema.agentConversationMessages).values({
        userId: req.user.id,
        agentId,
        role: "Account Holder",
        content: userMessage,
      });

      const { STRUCTURED_RUNTIME_MODELS } = await import("../lib/structured-runtime-models");

      const DIRECT_AGENT_TOOL_SCHEMA = {
        name: "direct_agent",
        description: "Reply to the Account Holder and propose changes.",
        input_schema: {
          type: "object" as const,
          properties: {
            reply: { type: "string", description: "Conversational reply (≤120 words)." },
            config_changes: { type: "array", items: { type: "object" } },
            tool_toggles: { type: "array", items: { type: "object" } },
            actions: { type: "array", items: { type: "object" } },
          },
          required: ["reply"],
        },
      };

      const name = agent.name || "the agent";
      const role = agent.role || "AI receptionist";
      const system = `You are ${name}, a Wireline AI ${role}. Reply in first person, warm and concise.`;
      const transcript = history
        .slice(-12)
        .map((m) => `${m.role === "Account Holder" ? "Operator" : "You"}: ${m.content}`)
        .join("\n");
      const user = `${transcript ? `Conversation:\n${transcript}\n\n` : ""}Operator: ${userMessage}`;

      try {
        const { result, thinking, thinkingDurationMs } = await runStructuredStream<{
          reply?: string;
          config_changes?: unknown;
          changes?: unknown;
          tool_toggles?: unknown;
          toolToggles?: unknown;
          actions?: unknown;
        }>(
          {
            system,
            user,
            tool: DIRECT_AGENT_TOOL_SCHEMA,
            model: STRUCTURED_RUNTIME_MODELS.STANDARD,
            maxTokens: 1500,
          },
          {
            onThinkingStart: () => sse.write("thinking_start", {}),
            onThinkingChunk: (text) => sse.write("thinking_chunk", { text }),
            onThinkingEnd: (fullText, durationMs) =>
              sse.write("thinking_end", { thinking: fullText, durationMs }),
            onResult: (r) => sse.write("reply", r),
          },
        );

        const reply = typeof result?.reply === "string" ? result.reply.trim() : "";
        // Normalize to client-expected keys (changes/toolToggles/actions) so
        // StudioWorkroom onComplete can populate interactive proposals.
        // The structured tool uses config_changes / tool_toggles in raw LLM output.
        const changes = (result as any)?.config_changes ?? (result as any)?.changes ?? [];
        const toolToggles = (result as any)?.tool_toggles ?? (result as any)?.toolToggles ?? [];
        const actions = (result as any)?.actions ?? [];

        sse.write("reply", { reply, changes, toolToggles, actions });
        sse.write("done", {
          reply,
          changes,
          toolToggles,
          actions,
          reasoning: thinking,
          thinkingDurationMs,
        });
        sse.end();
        void drizzle
          .insert(schema.agentConversationMessages)
          .values({
            userId: req.user.id,
            agentId,
            role: "agent",
            content: reply || "(empty)",
            reasoning: thinking || null,
          })
          .catch((err) =>
            log.error("workspace stream persist failed", { error: getErrorMessage(err), agentId }),
          );
      } catch (e) {
        if (e instanceof AppError) throw e;
        log.error("workspace stream failed", { error: getErrorMessage(e), agentId });
        sse.write("error", {
          message: publicAiStreamFailureMessage(e, "Failed to generate response"),
        });
        sse.end();
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      const errMsg = getErrorMessage(e);
      log.error("workspace stream setup failed", { error: errMsg });
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

// POST /api/agents/:id/workspace/files — upload a PDF, extract knowledge,
// add it to the agent's knowledge base, and acknowledge in the workspace thread.
//
// Reuses claudeBrain.knowledgeFromDocument (Claude's native PDF block).
// File arrives as base64 in the body — matches the existing
// /api/claude/knowledge-from-document contract. Keeps the upload path
// simple (no multer / multipart). 30MB ceiling.
router.post(
  "/api/agents/:id/workspace/files",
  authenticateUser,
  // PDF extraction is one of the most expensive single AI calls in the app
  // (native document blocks) and previously had NO rate limit and NO cost
  // accounting — a free tenant could drive unmetered model spend.
  claudeRateLimiter,
  enforceSpendCap,
  withAudit("workspace"),
  validateBody(pdfUploadSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const { pdfBase64, fileName } = req.body;
      // Magic-number sanity check — bail on obvious non-PDFs.
      try {
        const head = Buffer.from(pdfBase64.slice(0, 16), "base64").toString("utf8", 0, 5);
        if (!head.startsWith("%PDF")) {
          throw AppError.fromHttpStatus(400, "File does not look like a valid PDF.");
        }
      } catch {
        throw AppError.fromHttpStatus(400, "Malformed base64 payload.");
      }

      const [agent] = await drizzle
        .select({ id: schema.agents.id, name: schema.agents.name })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      // Extract knowledge entries via the managed runtime. Defer the heavy
      // import so cold-start cost isn't paid on every workspace message.
      const { knowledgeFromDocument, KnowledgeIngestionUnavailableError } =
        await import("../lib/ai-brains");
      let result;
      try {
        result = await knowledgeFromDocument({
          pdfBase64,
          fileName: typeof fileName === "string" ? fileName.slice(0, 255) : undefined,
          maxEntries: 12,
        });
      } catch (ingestError) {
        if (ingestError instanceof KnowledgeIngestionUnavailableError) {
          throw AppError.fromHttpStatus(503, ingestError.message);
        }
        throw ingestError;
      }

      // result.entries is an array of { content, tags? } per the
      // existing contract. Insert them into the agent's knowledge base
      // (deduped by content per the existing unique constraint).
      const entries: Array<{ content: string }> = Array.isArray((result as any).entries)
        ? (result as any).entries
        : [];
      let inserted = 0;
      for (const e of entries) {
        if (!e?.content) continue;
        try {
          await drizzle
            .insert(schema.knowledge)
            .values({
              userId: req.user.id,
              agentId,
              content: e.content,
              source: fileName ? `Workspace upload: ${fileName}` : "Workspace upload",
            } as any)
            .onConflictDoNothing();
          inserted++;
        } catch {
          // Continue inserting the rest even if one row conflicts.
        }
      }

      // Append an "agent" message to the workspace thread acknowledging
      // the file. Account Holder sees this immediately as if the agent
      // reviewed the upload. Keeps the chat surface coherent.
      const ack = `Got it — I read **${fileName || "the file"}** and pulled out ${inserted} knowledge ${inserted === 1 ? "item" : "items"} I'll reference on future calls. Want me to summarize what stood out?`;
      await drizzle.insert(schema.agentConversationMessages).values({
        userId: req.user.id,
        agentId,
        role: "agent",
        content: ack,
      });

      res.json({ inserted, total: entries.length });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("workspace file upload failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Couldn't process the file");
    }
  },
);

// DELETE /api/agents/:id/workspace/messages — clear the thread.
// Account Holders sometimes want a fresh start (new product launch, new vertical).
router.delete(
  "/api/agents/:id/workspace/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const [agent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      await drizzle
        .delete(schema.agentConversationMessages)
        .where(
          and(
            eq(schema.agentConversationMessages.agentId, agentId),
            eq(schema.agentConversationMessages.userId, req.user.id),
          ),
        );
      res.json({ cleared: true });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("workspace clear failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to clear workspace");
    }
  },
);

// POST /api/agents/:id/workspace/apply-change — apply a single allowlisted
// config change the Account Holder approved from a chat proposal card. Only the
// fields in WORKSPACE_FIELDS can be written this way; values are validated
// the same way the planner validates them before proposing.
router.post(
  "/api/agents/:id/workspace/apply-change",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const field = String(req.body?.field || "") as WorkspaceFieldKey;
      const rawValue = req.body?.value;
      const spec = WORKSPACE_FIELDS[field];
      if (!spec) throw AppError.fromHttpStatus(400, "Unknown field");
      if (typeof rawValue !== "string" || !rawValue.trim()) {
        throw AppError.fromHttpStatus(400, "Value required");
      }
      let value: string | boolean = rawValue.trim().slice(0, spec.maxLen);
      if (spec.kind === "boolean") {
        value = value.toLowerCase() === "true";
      }
      if (spec.kind === "vibe") {
        value = String(value).toLowerCase();
        if (!(WORKSPACE_VIBE_OPTIONS as readonly string[]).includes(value as string)) {
          return res.status(400).json({
            code: "BAD_REQUEST",
            error: `Vibe must be one of: ${WORKSPACE_VIBE_OPTIONS.join(", ")}`,
          });
        }
      } else if (spec.kind === "ambient") {
        value = String(value).toLowerCase();
        if (!(WORKSPACE_AMBIENT_OPTIONS as readonly string[]).includes(value as string)) {
          return res.status(400).json({
            code: "BAD_REQUEST",
            error: `Ambient noise must be one of: ${WORKSPACE_AMBIENT_OPTIONS.join(", ")}`,
          });
        }
      } else if (
        spec.kind === "email" &&
        typeof value === "string" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ) {
        throw AppError.fromHttpStatus(400, "That doesn't look like a valid email.");
      } else if (
        spec.kind === "phone" &&
        typeof value === "string" &&
        !/^[+\d][\d\s()-]{5,19}$/.test(value)
      ) {
        throw AppError.fromHttpStatus(400, "That doesn't look like a valid phone number.");
      } else if (spec.kind === "url" && typeof value === "string" && !/^https?:\/\//.test(value)) {
        throw AppError.fromHttpStatus(400, "That doesn't look like a valid URL.");
      }

      const agent = await findOwnedAgentProfile(agentId, req.user.id);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      await drizzle
        .update(schema.agents)
        .set({ [spec.column]: value })
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)));

      log.info("workspace config change applied", { agentId, field });
      res.json({ success: true, field, label: spec.label, value });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("workspace apply-change failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to apply change");
    }
  },
);

// POST /api/agents/:id/workspace/toggle-tool — turn a capability on/off for
// the agent from a chat proposal card. Writes the resolved enabled_tools
// array so the change is explicit (never reverts to role defaults silently).
router.post(
  "/api/agents/:id/workspace/toggle-tool",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const tool = req.body?.tool;
      const enable = req.body?.enable;
      if (!isAgentToolName(tool)) throw AppError.fromHttpStatus(400, "Unknown tool");
      if (typeof enable !== "boolean") throw AppError.fromHttpStatus(400, "enable must be boolean");

      const agent = await findOwnedAgentProfile(agentId, req.user.id);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      const current = resolveAgentTools(agent.role ?? undefined, agent.enabledTools);
      const next = enable
        ? Array.from(new Set([...current, tool]))
        : current.filter((t) => t !== tool);

      await drizzle
        .update(schema.agents)
        .set({ enabledTools: normalizeEnabledTools(next) })
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)));

      log.info("workspace tool toggled", { agentId, tool, enable });
      res.json({ success: true, tool, enable, enabledTools: next });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("workspace toggle-tool failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to toggle capability");
    }
  },
);

// POST /api/agents/:id/workspace/run-action — execute an approved
// communication action (email/text) the agent drafted in chat. Routes
// through the existing Action Engine, which enforces per-agent tool
// authorization + supervisor review. Outbound CALLS are intentionally NOT
// handled here — the client routes those to /api/outbound/dial so the
// DNC/TCPA/quota gates run unchanged.
router.post(
  "/api/agents/:id/workspace/run-action",
  authenticateUser,
  smsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const kind = String(req.body?.kind || "");
      const to = String(req.body?.to || "").trim();
      const subject = String(req.body?.subject || "").trim();
      const body = String(req.body?.body || "").trim();

      if (kind !== "send_email" && kind !== "send_text_message") {
        throw AppError.fromHttpStatus(400, "Unsupported action for this endpoint");
      }
      if (!to) throw AppError.fromHttpStatus(400, "Recipient required");
      if (!body) throw AppError.fromHttpStatus(400, "Message body required");

      const agent = await findOwnedAgentProfile(agentId, req.user.id);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      const payload =
        kind === "send_email" ? { to, subject: subject || "Follow-up", body } : { to, body };

      const result = await executeAction(
        req.user.id,
        {
          type: kind,
          priority: "high",
          payload,
          reasoning: "Account Holder-approved action from agent chat",
          agentId,
        },
        { sourceId: agentId, sourceType: "workspace_chat" },
        "auto",
      );

      if (!result.success) {
        throw AppError.fromHttpStatus(400, String(result.error || "Action failed"));
      }
      log.info("workspace action executed", { agentId, kind });
      res.json({ success: true, kind });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("workspace run-action failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to run action");
    }
  },
);

// GET /api/agents/:id/workspace/overview — live operational pulse for the
// agent's "mission control" dock: rolling 24h activity counts across every
// channel the agent works (calls, email, text, bookings, queued tasks) plus
// the latest call outcomes. Powers the right-hand dock without blocking the
// chat thread load — the client fetches it in parallel and refreshes it on a
// light interval. All counts are owner-scoped + agent-scoped.
router.get(
  "/api/agents/:id/workspace/overview",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const agent = await findOwnedAgentProfile(agentId, req.user.id);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [callRows, emailRows, textRows, bookingRows, openTaskRows, recentCalls] =
        await drizzle.transaction((tx) =>
          Promise.all([
            tx
              .select({ n: sql<number>`count(*)::int` })
              .from(schema.callLogs)
              .where(
                and(
                  eq(schema.callLogs.agentId, agentId),
                  eq(schema.callLogs.userId, req.user.id),
                  gte(schema.callLogs.createdAt, since),
                ),
              ),
            tx
              .select({ n: sql<number>`count(*)::int` })
              .from(schema.emailThreads)
              .where(
                and(
                  eq(schema.emailThreads.agentId, agentId),
                  eq(schema.emailThreads.userId, req.user.id),
                  gte(schema.emailThreads.createdAt, since),
                ),
              ),
            tx
              .select({ n: sql<number>`count(*)::int` })
              .from(schema.smsThreads)
              .where(
                and(
                  eq(schema.smsThreads.agentId, agentId),
                  eq(schema.smsThreads.userId, req.user.id),
                  gte(schema.smsThreads.createdAt, since),
                ),
              ),
            tx
              .select({ n: sql<number>`count(*)::int` })
              .from(schema.appointments)
              .where(
                and(
                  eq(schema.appointments.agentId, agentId),
                  eq(schema.appointments.userId, req.user.id),
                  gte(schema.appointments.createdAt, since),
                ),
              ),
            tx
              .select({ n: sql<number>`count(*)::int` })
              .from(schema.followUpTasks)
              .where(
                and(
                  eq(schema.followUpTasks.agentId, agentId),
                  eq(schema.followUpTasks.userId, req.user.id),
                  eq(schema.followUpTasks.status, "pending"),
                ),
              ),
            tx
              .select({
                summary: schema.callLogs.summary,
                sentiment: schema.callLogs.sentiment,
                intent: schema.callLogs.intentLabel,
                outcome: schema.callLogs.outcomeTag,
                createdAt: schema.callLogs.createdAt,
              })
              .from(schema.callLogs)
              .where(
                and(eq(schema.callLogs.agentId, agentId), eq(schema.callLogs.userId, req.user.id)),
              )
              .orderBy(desc(schema.callLogs.createdAt))
              .limit(4),
          ])
        );

      res.json({
        pulse: {
          calls: callRows[0]?.n ?? 0,
          emails: emailRows[0]?.n ?? 0,
          texts: textRows[0]?.n ?? 0,
          bookings: bookingRows[0]?.n ?? 0,
          openTasks: openTaskRows[0]?.n ?? 0,
          windowHours: 24,
        },
        recentCalls: recentCalls.map((c) => ({
          summary: c.summary ?? null,
          sentiment: c.sentiment ?? null,
          intent: c.intent ?? null,
          outcome: c.outcome ?? null,
          createdAt: c.createdAt,
        })),
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("workspace overview failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load overview");
    }
  },
);

export default router;
