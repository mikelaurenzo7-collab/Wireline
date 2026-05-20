/**
 * Agent Workspace — per-agent operator chat.
 *
 * Each agent the operator owns has its own persistent chat thread.
 * Distinct from /train (configuration) and from call logs (caller-facing).
 * Think of this as the private DM channel the operator has with each
 * AI agent: ongoing direction, coaching, "how did calls go this week?",
 * context the operator wants the agent to know about.
 *
 * Memory model:
 *   - The thread itself IS the memory — Claude reads the full message
 *     history each call.
 *   - PLUS we inject context: agent name/role/archetype, current flow
 *     stage names, recent (last 5) call summaries with intent + sentiment.
 *   - Operators can tell the agent "be warmer on price objections" and
 *     the next call will reflect it (lessons sync is separate but
 *     connected — chat-derived directives can be turned into formal
 *     lessons via a follow-up button).
 */
import express, { type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";

const router = express.Router();

// Hard cap on stored history per agent — keeps the LLM payload bounded
// + storage manageable. Most operators won't get near this. When the
// cap is hit, oldest rows are silently pruned on the next write.
const MAX_THREAD_LENGTH = 200;
// How many messages we feed back to Claude as conversational context.
// Older than this is still in the DB (visible in the UI) but doesn't
// influence the agent's response. Keeps token cost predictable.
const CLAUDE_CONTEXT_WINDOW = 40;

// Builds the system prompt for the workspace agent. Mirrors the voice
// agent's identity (so the operator IS talking to the same character)
// but reframes the audience: the operator, not the caller.
function buildWorkspaceSystemPrompt(
  agent: {
    name: string | null;
    role: string | null;
    archetype: string | null;
    personality_vibe: string | null;
  },
  recentCalls: Array<{
    summary: string | null;
    sentiment: string | null;
    intent: string | null;
    created_at: Date | null;
  }>,
) {
  const name = agent.name || "the agent";
  const role = agent.role || "AI receptionist";
  const archetype = agent.archetype || "warm professional";
  const vibe = agent.personality_vibe || "warm";

  const callsSummary =
    recentCalls.length === 0
      ? "(No calls handled yet — this agent hasn't taken any conversations to learn from.)"
      : recentCalls
          .map(
            (c, i) =>
              `${i + 1}. [${c.sentiment || "neutral"} / ${c.intent || "unknown"}] ${c.summary || "(no summary)"}`,
          )
          .join("\n");

  return `You are ${name}, a Wireline AI ${role} (archetype: ${archetype}, vibe: ${vibe}). You're currently in a private chat with your operator — the person who owns and manages you. This is your one-on-one channel where they coach you, give you context about the business, and direct your performance.

This is NOT a caller conversation. The operator is the person paying for your service. Be:
- Direct and helpful, not salesy
- Receptive to coaching — they're telling you how they want you to behave
- Concrete with specifics — when they ask "how did calls go?", reference actual call summaries below
- Honest about what you don't know — say so plainly if you can't answer
- Brief by default; expand only when the operator asks for depth

Stay in character as ${name}. Use first-person — you ARE the agent they configured, not a separate AI describing it.

If the operator gives you new direction (e.g. "be warmer on price objections" or "always mention our same-day install"), acknowledge it explicitly and note that it will apply to future calls. You don't have authority to silently change your own configuration — confirmable directives become lessons in the next sync.

Recent call summaries (last ${recentCalls.length} calls handled):
${callsSummary}

The operator is now writing to you. Reply as ${name}.`;
}

// GET /api/agents/:id/workspace/messages — load thread history.
router.get(
  "/api/agents/:id/workspace/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const [agent] = await drizzle
        .select({ id: schema.agents.id, name: schema.agents.name })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

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

      // Return newest-last so the UI can append directly.
      res.json({
        agent: { id: agent.id, name: agent.name },
        messages: messages.reverse().map((m) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      });
    } catch (e) {
      log.error("workspace messages fetch failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to load workspace messages" });
    }
  },
);

// POST /api/agents/:id/workspace/messages — operator sends, agent replies.
router.post(
  "/api/agents/:id/workspace/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const operatorMessage = String(req.body?.content || "").trim();
      if (!operatorMessage) {
        return res.status(400).json({ error: "Message content required" });
      }
      if (operatorMessage.length > 4000) {
        return res.status(400).json({ error: "Message too long — keep under 4000 chars" });
      }

      // Load agent + recent call context.
      const [agent] = await drizzle
        .select({
          id: schema.agents.id,
          name: schema.agents.name,
          role: schema.agents.role,
          archetype: schema.agents.archetype,
          personality_vibe: schema.agents.personalityVibe,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const recentCalls = await drizzle
        .select({
          summary: schema.callLogs.summary,
          sentiment: schema.callLogs.sentimentLabel,
          intent: schema.callLogs.intentLabel,
          created_at: schema.callLogs.createdAt,
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

      const chronological = priorMessages.reverse();

      // Persist the operator's message immediately so it survives any LLM failure downstream.
      await drizzle.insert(schema.agentConversationMessages).values({
        userId: req.user.id,
        agentId,
        role: "operator",
        content: operatorMessage,
      });

      // Build the Anthropic-style messages array — alternating turns.
      // operator → user, agent → assistant. The new operator message
      // is the last user turn.
      const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const m of chronological) {
        turns.push({
          role: m.role === "operator" ? "user" : "assistant",
          content: m.content,
        });
      }
      turns.push({ role: "user", content: operatorMessage });

      const systemPrompt = buildWorkspaceSystemPrompt(agent as any, recentCalls);

      // Direct SDK call — multi-turn isn't covered by claude-brain's
      // runCompletion helper (single-user-turn signature).
      const apiKey = process.env.ANTHROPIC_API_KEY;
      let agentReply: string;
      if (!apiKey) {
        agentReply =
          "I can't respond right now — the LLM isn't configured. Your message is saved; try again later.";
      } else {
        try {
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model: "claude-opus-4-7",
            max_tokens: 1024,
            system: systemPrompt,
            messages: turns,
          });
          agentReply =
            response.content
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("\n")
              .trim() || "(no reply — the model returned an empty response)";
        } catch (e) {
          log.error("workspace LLM call failed", { error: getErrorMessage(e), agentId });
          agentReply =
            "Sorry — I'm having trouble responding right now. Your message is saved; try again in a moment.";
        }
      }

      await drizzle.insert(schema.agentConversationMessages).values({
        userId: req.user.id,
        agentId,
        role: "agent",
        content: agentReply,
      });

      res.json({ reply: agentReply });
    } catch (e) {
      log.error("workspace POST failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to send message" });
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
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const { pdfBase64, fileName } = req.body ?? {};
      if (!pdfBase64 || typeof pdfBase64 !== "string") {
        return res.status(400).json({ error: "pdfBase64 required" });
      }
      if (pdfBase64.length > 40 * 1024 * 1024) {
        return res.status(413).json({ error: "File exceeds 30MB. Split it up." });
      }
      // Magic-number sanity check — bail on obvious non-PDFs.
      try {
        const head = Buffer.from(pdfBase64.slice(0, 16), "base64").toString("utf8", 0, 5);
        if (!head.startsWith("%PDF")) {
          return res.status(400).json({ error: "File does not look like a valid PDF." });
        }
      } catch {
        return res.status(400).json({ error: "Malformed base64 payload." });
      }

      const [agent] = await drizzle
        .select({ id: schema.agents.id, name: schema.agents.name })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      // Extract knowledge entries via Claude. Defer the heavy import so
      // cold-start cost isn't paid on every workspace message.
      const { knowledgeFromDocument } = await import("../lib/claude-brain");
      const result = await knowledgeFromDocument({
        pdfBase64,
        fileName: typeof fileName === "string" ? fileName.slice(0, 255) : undefined,
        maxEntries: 12,
      });

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
      // the file. Operator sees this immediately as if the agent
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
      log.error("workspace file upload failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Couldn't process the file" });
    }
  },
);

// DELETE /api/agents/:id/workspace/messages — clear the thread.
// Operators sometimes want a fresh start (new product launch, new vertical).
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
      if (!agent) return res.status(404).json({ error: "Agent not found" });

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
      log.error("workspace clear failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to clear workspace" });
    }
  },
);

export default router;
