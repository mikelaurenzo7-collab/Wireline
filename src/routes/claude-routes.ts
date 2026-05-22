import express, { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import { drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import * as claudeBrain from "../lib/claude-brain";
import { claudeErr } from "../lib/claude-response-helpers";
import { parseFormData, DirectiveSchema } from "../lib/form-validators";
import { DEFAULT_AGENT_ROLE } from "../lib/agent-constants";
import { dispatchWebhook } from "../lib/webhook-helpers";
import { isSsrfUrl } from "../lib/webhook-validators";

const router = express.Router();

router.get("/status", authenticateUser, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    available: claudeBrain.isClaudeAvailable(),
    model: claudeBrain.CLAUDE_MODEL_DEFAULT,
    capabilities: [
      "brief",
      "qualify",
      "objection-drill",
      "cold-email",
      "persona-clone",
      "summarize-thread",
      "route-intent",
      "smart-draft",
      "agent-review",
    ],
  });
});

router.post("/brief", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agentId, customerName, customerNumber, reasonForCall, pastInteractionSummary } =
      req.body;
    let agentName = "Wireline Agent";
    let agentArchetype = "Receptionist";
    let knowledgeBase: string[] = [];
    let role: string | undefined;

    if (agentId) {
      const [agentRows, knowledgeRows] = await Promise.all([
        drizzle
          .select({
            name: schema.agents.name,
            archetype: schema.agents.archetype,
            role: schema.agents.role,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
          .limit(1),
        drizzle
          .select({ content: schema.knowledge.content })
          .from(schema.knowledge)
          .where(
            and(eq(schema.knowledge.agentId, agentId), eq(schema.knowledge.userId, req.user.id)),
          )
          .limit(500),
      ]);
      const agent = agentRows[0];
      if (agent) {
        agentName = agent.name;
        agentArchetype = agent.archetype || "Receptionist";
        role = agent.role || DEFAULT_AGENT_ROLE;
      }
      knowledgeBase = (knowledgeRows ?? []).map((k: { content: string }) => k.content);
    }

    const result = await claudeBrain.brief({
      agentName,
      agentArchetype,
      role,
      customerName,
      customerNumber,
      reasonForCall: reasonForCall || "No specific reason provided.",
      knowledgeBase,
      pastInteractionSummary,
    });
    res.json({ brief: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post("/qualify", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { source, transcript, callId, threadId, agentId } = req.body;
    let actualTranscript: string = transcript;
    let metadata: Record<string, any> = {};
    let resolvedAgentId: string | undefined = agentId;

    if (!actualTranscript && callId) {
      const [call] = await drizzle
        .select()
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.id, BigInt(callId)), eq(schema.callLogs.userId, req.user.id)))
        .limit(1);

      actualTranscript = call?.transcript ?? call?.summary ?? "";
      metadata = { customer_number: call?.customerNumber, duration_seconds: call?.durationSeconds };
      if (!resolvedAgentId && call?.agentId) resolvedAgentId = call.agentId;
    } else if (!actualTranscript && threadId) {
      const [thread] = await drizzle
        .select({ agentId: schema.emailThreads.agentId })
        .from(schema.emailThreads)
        .where(
          and(eq(schema.emailThreads.id, threadId), eq(schema.emailThreads.userId, req.user.id)),
        )
        .limit(1);

      if (!resolvedAgentId && thread?.agentId) resolvedAgentId = thread.agentId;
      const msgs = await drizzle
        .select({ role: schema.emailMessages.role, content: schema.emailMessages.content })
        .from(schema.emailMessages)
        .where(
          and(
            eq(schema.emailMessages.threadId, threadId),
            eq(schema.emailMessages.userId, req.user.id),
          ),
        )
        .orderBy(schema.emailMessages.createdAt)
        .limit(100);

      actualTranscript = (msgs ?? [])
        .map(
          (m: { role: string | null; content: string | null }) =>
            `${(m.role || "user").toUpperCase()}: ${m.content}`,
        )
        .join("\n\n");
    }

    if (!actualTranscript) {
      return res
        .status(400)
        .json({ error: "No transcript provided (and no callId/threadId to fetch from)." });
    }

    let role: string | undefined;
    if (resolvedAgentId) {
      const [agent] = await drizzle
        .select({ role: schema.agents.role })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, resolvedAgentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (agent) role = agent.role || DEFAULT_AGENT_ROLE;
    }

    const result = await claudeBrain.qualify({
      source: source ?? "voice_call",
      transcript: actualTranscript,
      metadata,
      role,
    });
    res.json({ qualification: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post(
  "/objection-drill",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agentId, topic, count } = req.body;
      let agentName = "Wireline Agent";
      let archetype = "Receptionist";
      let role: string | undefined;
      if (agentId) {
        const [agent] = await drizzle
          .select({
            name: schema.agents.name,
            archetype: schema.agents.archetype,
            role: schema.agents.role,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (agent) {
          agentName = agent.name;
          archetype = agent.archetype || "Receptionist";
          role = agent.role || DEFAULT_AGENT_ROLE;
        }
      }
      const result = await claudeBrain.objectionDrill({
        agentName,
        archetype,
        role,
        topic: topic || "general sales objections",
        count: count ?? 5,
      });
      res.json(result);
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post("/cold-email", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agentId, ...rest } = req.body ?? {};
    let agentRole: string | undefined = rest.agentRole;
    if (agentId && !agentRole) {
      const [agent] = await drizzle
        .select({ role: schema.agents.role })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (agent) agentRole = agent.role || DEFAULT_AGENT_ROLE;
    }
    const result = await claudeBrain.coldEmail({ ...rest, agentRole });
    res.json({ email: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post(
  "/persona-clone",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { description, samples, agentId, applyToAgent } = req.body;
      if (!Array.isArray(samples) || samples.length === 0) {
        return res.status(400).json({ error: "Provide at least one sample message." });
      }
      const result = await claudeBrain.personaClone({
        description: description || "Unknown persona",
        samples,
      });

      if (applyToAgent && agentId) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (agent) {
          await drizzle
            .insert(schema.personality)
            .values({
              agentId,
              userId: req.user.id,
              content: result.persona_block,
            })
            .onConflictDoUpdate({
              target: schema.personality.agentId,
              set: { content: result.persona_block, userId: req.user.id },
            });
        }
      }
      res.json({ persona: result, applied: !!(applyToAgent && agentId) });
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post(
  "/summarize-thread",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { threadId } = req.body;
      const [thread] = await drizzle
        .select({ subject: schema.emailThreads.subject })
        .from(schema.emailThreads)
        .where(
          and(eq(schema.emailThreads.id, threadId), eq(schema.emailThreads.userId, req.user.id)),
        )
        .limit(1);

      if (!thread) return res.status(404).json({ error: "Thread not found." });

      const msgs = await drizzle
        .select({ role: schema.emailMessages.role, content: schema.emailMessages.content })
        .from(schema.emailMessages)
        .where(
          and(
            eq(schema.emailMessages.threadId, threadId),
            eq(schema.emailMessages.userId, req.user.id),
          ),
        )
        .orderBy(schema.emailMessages.createdAt)
        .limit(100);

      const result = await claudeBrain.threadSummary({
        subject: thread.subject || "(no subject)",
        messages: (msgs ?? []) as any,
      });
      res.json({ summary: result });
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post("/route-intent", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await claudeBrain.routeIntent({ text: req.body.text || "" });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post("/email-draft", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId, agentId, userInstructions } = req.body;
    const [thread] = await drizzle
      .select({ subject: schema.emailThreads.subject, agentId: schema.emailThreads.agentId })
      .from(schema.emailThreads)
      .where(and(eq(schema.emailThreads.id, threadId), eq(schema.emailThreads.userId, req.user.id)))
      .limit(1);

    if (!thread) return res.status(404).json({ error: "Thread not found." });

    const targetAgentId = agentId || thread.agentId;
    let agentName = "Wireline Agent";
    let agentTone = "Professional";
    let agentRole: string | undefined;
    let agentSignature = "";
    let knowledgeBase: string[] = [];
    let directives: string[] = [];

    if (targetAgentId) {
      const [agentRows, knowledgeRows, directiveRows] = await Promise.all([
        drizzle
          .select({
            name: schema.agents.name,
            emailAgentTone: schema.agents.emailAgentTone,
            emailSignature: schema.agents.emailSignature,
            role: schema.agents.role,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, targetAgentId), eq(schema.agents.userId, req.user.id)))
          .limit(1),
        drizzle
          .select({ content: schema.knowledge.content })
          .from(schema.knowledge)
          .where(
            and(
              eq(schema.knowledge.agentId, targetAgentId),
              eq(schema.knowledge.userId, req.user.id),
            ),
          )
          .limit(500),
        drizzle
          .select({ content: schema.directives.content })
          .from(schema.directives)
          .where(
            and(
              eq(schema.directives.agentId, targetAgentId),
              eq(schema.directives.userId, req.user.id),
            ),
          )
          .orderBy(desc(schema.directives.priority))
          .limit(500),
      ]);
      const agent = agentRows[0];
      if (agent) {
        agentName = agent.name;
        agentTone = agent.emailAgentTone || "Professional";
        agentSignature = agent.emailSignature || "";
        agentRole = agent.role || DEFAULT_AGENT_ROLE;
      }
      knowledgeBase = (knowledgeRows ?? []).map((k: { content: string }) => k.content);
      directives = (directiveRows ?? []).map((d: { content: string }) => d.content);
    }

    const msgs = await drizzle
      .select({ role: schema.emailMessages.role, content: schema.emailMessages.content })
      .from(schema.emailMessages)
      .where(
        and(
          eq(schema.emailMessages.threadId, threadId),
          eq(schema.emailMessages.userId, req.user.id),
        ),
      )
      .orderBy(schema.emailMessages.createdAt)
      .limit(100);

    const result = await claudeBrain.smartDraft({
      agentName,
      agentTone,
      agentRole,
      agentSignature,
      knowledgeBase,
      directives,
      threadSubject: thread.subject || "(no subject)",
      threadMessages: (msgs ?? []) as any,
      userInstructions,
    });

    res.json({
      draft: result.draft,
      diagnostics: { cacheRead: result.cacheRead, cacheCreate: result.cacheCreate },
    });
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post(
  "/email-quick-replies",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { threadId, agentId } = req.body;
      if (!threadId) return res.status(400).json({ error: "threadId required" });

      const [thread] = await drizzle
        .select({ subject: schema.emailThreads.subject, agentId: schema.emailThreads.agentId })
        .from(schema.emailThreads)
        .where(
          and(eq(schema.emailThreads.id, threadId), eq(schema.emailThreads.userId, req.user.id)),
        )
        .limit(1);

      if (!thread) return res.status(404).json({ error: "Thread not found." });

      const targetAgentId = agentId || thread.agentId;
      let agentName = "Wireline Agent";
      let agentTone = "Professional";
      let agentRole: string | undefined;
      let agentSignature = "";
      let knowledgeBase: string[] = [];

      if (targetAgentId) {
        const [agentRows, knowledgeRows] = await Promise.all([
          drizzle
            .select({
              name: schema.agents.name,
              emailAgentTone: schema.agents.emailAgentTone,
              emailSignature: schema.agents.emailSignature,
              role: schema.agents.role,
            })
            .from(schema.agents)
            .where(and(eq(schema.agents.id, targetAgentId), eq(schema.agents.userId, req.user.id)))
            .limit(1),
          drizzle
            .select({ content: schema.knowledge.content })
            .from(schema.knowledge)
            .where(
              and(
                eq(schema.knowledge.agentId, targetAgentId),
                eq(schema.knowledge.userId, req.user.id),
              ),
            )
            .limit(20),
        ]);
        const agent = agentRows[0];
        if (agent) {
          agentName = agent.name;
          agentTone = agent.emailAgentTone || "Professional";
          agentSignature = agent.emailSignature || "";
          agentRole = agent.role || DEFAULT_AGENT_ROLE;
        }
        knowledgeBase = (knowledgeRows ?? []).map((k: { content: string }) => k.content);
      }

      const msgs = await drizzle
        .select({ role: schema.emailMessages.role, content: schema.emailMessages.content })
        .from(schema.emailMessages)
        .where(
          and(
            eq(schema.emailMessages.threadId, threadId),
            eq(schema.emailMessages.userId, req.user.id),
          ),
        )
        .orderBy(schema.emailMessages.createdAt)
        .limit(100);

      const result = await claudeBrain.quickReplies({
        agentName,
        agentTone,
        agentRole,
        agentSignature,
        knowledgeBase,
        threadSubject: thread.subject || "(no subject)",
        threadMessages: (msgs ?? []) as any,
      });

      res.json({ suggestions: result.suggestions });
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post("/agent-review", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agentId, lookback } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    const [agent] = await drizzle
      .select({
        name: schema.agents.name,
        archetype: schema.agents.archetype,
        role: schema.agents.role,
      })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
      .limit(1);

    if (!agent) return res.status(404).json({ error: "Agent not found." });

    const logs = await drizzle
      .select({
        summary: schema.callLogs.summary,
        transcript: schema.callLogs.transcript,
        leadScore: schema.callLogs.leadScore,
        intentLabel: schema.callLogs.intentLabel,
      })
      .from(schema.callLogs)
      .where(and(eq(schema.callLogs.agentId, agentId), eq(schema.callLogs.userId, req.user.id)))
      .orderBy(desc(schema.callLogs.createdAt))
      .limit(Math.min(lookback ?? 15, 30));
    if (!logs || logs.length === 0) {
      return res
        .status(400)
        .json({ error: "Insufficient data — need at least 1 completed call.", code: "NO_DATA" });
    }
    const result = await claudeBrain.agentReview({
      agentName: agent.name,
      archetype: agent.archetype,
      role: agent.role || DEFAULT_AGENT_ROLE,
      callLogs: logs as any,
    });
    res.json({ review: result, lookback: logs.length });
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post(
  "/call-playbook",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agentId, scenario } = req.body;
      if (!agentId) return res.status(400).json({ error: "agentId required" });
      if (!scenario?.trim()) return res.status(400).json({ error: "scenario required" });

      const [agentRows, knowledgeRows, directiveRows, settingRows] = await Promise.all([
        drizzle
          .select({ name: schema.agents.name, role: schema.agents.role })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
          .limit(1),
        drizzle
          .select({ content: schema.knowledge.content })
          .from(schema.knowledge)
          .where(
            and(eq(schema.knowledge.agentId, agentId), eq(schema.knowledge.userId, req.user.id)),
          )
          .limit(20),
        drizzle
          .select({ content: schema.directives.content })
          .from(schema.directives)
          .where(
            and(eq(schema.directives.agentId, agentId), eq(schema.directives.userId, req.user.id)),
          )
          .orderBy(desc(schema.directives.priority))
          .limit(10),
        drizzle
          .select({ businessName: schema.settings.businessName })
          .from(schema.settings)
          .where(eq(schema.settings.userId, req.user.id))
          .limit(1),
      ]);
      const agent = agentRows[0];
      const settings = settingRows[0];
      if (!agent) return res.status(404).json({ error: "Agent not found." });

      const playbook = await claudeBrain.buildCallPlaybook({
        agentName: agent.name,
        agentRole: agent.role || DEFAULT_AGENT_ROLE,
        scenario: scenario.trim(),
        knowledgeBase: (knowledgeRows ?? []).map((k: { content: string }) => k.content),
        directives: (directiveRows ?? []).map((d: { content: string }) => d.content),
        companyName: settings?.businessName || undefined,
      });

      res.json({ playbook });
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post(
  "/agent-review/apply-directive",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = parseFormData(DirectiveSchema, { content: req.body.directive });
      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", errors: validation.errors });
      }
      if (!validation.data) throw new Error("Validation data missing");

      const { agentId, priority } = req.body;
      const { content: directive } = validation.data;
      const [agent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);

      if (!agent) return res.status(404).json({ error: "Agent not found." });
      const priorityMap: Record<string, number> = { critical: 10, high: 7, medium: 5, low: 3 };
      await drizzle.insert(schema.directives).values({
        agentId,
        userId: req.user.id,
        content: directive,
        priority: priorityMap[priority] ?? 5,
      });
      res.json({ success: true });
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post(
  "/post-call/:callId",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [call] = await drizzle
        .select()
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.id, BigInt(req.params.callId)),
            eq(schema.callLogs.userId, req.user.id),
          ),
        )
        .limit(1);

      if (!call) return res.status(404).json({ error: "Call not found." });

      const [agent] = await drizzle
        .select({
          name: schema.agents.name,
          archetype: schema.agents.archetype,
          role: schema.agents.role,
        })
        .from(schema.agents)
        .where(eq(schema.agents.id, call.agentId || ""))
        .limit(1);

      const result = await claudeBrain.postCallAnalysis({
        agentName: agent?.name || "Wireline Agent",
        archetype: agent?.archetype || "Receptionist",
        role: agent?.role || undefined,
        customerNumber: call.customerNumber,
        durationSeconds: call.durationSeconds,
        summary: call.summary || "",
        transcript: call.transcript || "",
      });

      await drizzle
        .update(schema.callLogs)
        .set({
          leadScore: result.lead_score,
          intentLabel: result.intent_label,
        })
        .where(eq(schema.callLogs.id, call.id));

      res.json({ analysis: result });
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post("/coach", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { transcript: rawTranscript, callId, agentId, isLive } = req.body;
    let transcript = rawTranscript as string | undefined;
    let agentName = "Wireline Agent";
    let archetype = "Receptionist";
    let role: string | undefined;

    if (callId) {
      const [call] = await drizzle
        .select({ transcript: schema.callLogs.transcript, agentId: schema.callLogs.agentId })
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.id, BigInt(callId)), eq(schema.callLogs.userId, req.user.id)))
        .limit(1);

      if (call) {
        transcript = transcript || call.transcript || undefined;
        const [a] = await drizzle
          .select({
            name: schema.agents.name,
            archetype: schema.agents.archetype,
            role: schema.agents.role,
          })
          .from(schema.agents)
          .where(eq(schema.agents.id, call.agentId || ""))
          .limit(1);
        if (a) {
          agentName = a.name;
          archetype = a.archetype || "Receptionist";
          role = a.role || undefined;
        }
      }
    } else if (agentId) {
      const [a] = await drizzle
        .select({
          name: schema.agents.name,
          archetype: schema.agents.archetype,
          role: schema.agents.role,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (a) {
        agentName = a.name;
        archetype = a.archetype || "Receptionist";
        role = a.role || undefined;
      }
    }

    if (!transcript) return res.status(400).json({ error: "Provide a transcript or callId." });

    const result = await claudeBrain.coach({
      agentName,
      archetype,
      role,
      transcript,
      isLive: !!isLive,
    });
    res.json({ coaching: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post(
  "/knowledge-from-url",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url, agentContext, maxEntries, maxPages } = req.body;
      if (!url || typeof url !== "string" || url.length > 2048) {
        return res.status(400).json({ error: "url required (max 2048 chars)." });
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "url is not a valid URL." });
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return res.status(400).json({ error: "url must use http:// or https://" });
      }
      if (isSsrfUrl(url)) {
        return res
          .status(400)
          .json({ error: "url targets a private or internal address and cannot be crawled." });
      }
      if (
        agentContext != null &&
        (typeof agentContext !== "string" || agentContext.length > 2000)
      ) {
        return res.status(400).json({ error: "agentContext must be a string ≤ 2000 characters." });
      }
      const safeMaxEntries = Math.max(1, Math.min(50, Number(maxEntries) || 12));
      const safeMaxPages = Math.max(1, Math.min(20, Number(maxPages) || 5));

      const result = await claudeBrain.knowledgeFromUrl({
        url,
        agentContext,
        maxEntries: safeMaxEntries,
        maxPages: safeMaxPages,
      });
      res.json(result);
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post(
  "/knowledge-from-document",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { pdfBase64, fileName, agentContext, maxEntries } = req.body;
      if (!pdfBase64 || typeof pdfBase64 !== "string") {
        return res
          .status(400)
          .json({ error: "pdfBase64 required (base64-encoded PDF, no data: prefix)." });
      }
      if (pdfBase64.length > 40 * 1024 * 1024) {
        return res
          .status(413)
          .json({ error: "PDF exceeds 30MB limit. Split it into smaller documents." });
      }
      let head = "";
      try {
        head = Buffer.from(pdfBase64.slice(0, 16), "base64").toString("utf8", 0, 5);
      } catch {
        /* malformed base64 — falls through to the %PDF magic-number check below */
      }
      if (!head.startsWith("%PDF")) {
        return res.status(400).json({ error: "File does not look like a valid PDF." });
      }
      if (fileName != null && (typeof fileName !== "string" || fileName.length > 255)) {
        return res.status(400).json({ error: "fileName must be a string ≤ 255 characters." });
      }
      if (
        agentContext != null &&
        (typeof agentContext !== "string" || agentContext.length > 2000)
      ) {
        return res.status(400).json({ error: "agentContext must be a string ≤ 2000 characters." });
      }
      const safeMaxEntries = Math.max(1, Math.min(50, Number(maxEntries) || 12));

      const result = await claudeBrain.knowledgeFromDocument({
        pdfBase64,
        fileName,
        agentContext,
        maxEntries: safeMaxEntries,
      });
      res.json(result);
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post(
  "/knowledge-from-url/apply",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agentId, entries } = req.body;
      if (!agentId || !Array.isArray(entries)) {
        return res.status(400).json({ error: "agentId and entries[] required." });
      }
      const [agent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);

      if (!agent) return res.status(404).json({ error: "Agent not found." });

      const rows = entries
        .filter((e: any) => typeof e?.fact === "string" && e.fact.trim())
        .map((e: any) => ({
          agentId: agentId,
          userId: req.user.id,
          content: e.fact.trim(),
        }));
      if (rows.length === 0) return res.status(400).json({ error: "No valid entries to insert." });
      await drizzle.insert(schema.knowledge).values(rows);
      dispatchWebhook(req.user.id, "knowledge_updated", {
        action: "bulk_created",
        agent_id: agentId,
        count: rows.length,
      }).catch(() => {});
      res.json({ inserted: rows.length });
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

const KNOWLEDGE_DEDUPE_MAX_FACTS = 400;
router.post(
  "/knowledge-dedupe",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!claudeBrain.isClaudeAvailable()) {
        return res
          .status(503)
          .json({ error: "Claude required for knowledge dedupe.", code: "CLAUDE_OFFLINE" });
      }
      const [rows, agentList] = await Promise.all([
        drizzle
          .select({
            id: schema.knowledge.id,
            agentId: schema.knowledge.agentId,
            content: schema.knowledge.content,
          })
          .from(schema.knowledge)
          .where(eq(schema.knowledge.userId, req.user.id))
          .limit(KNOWLEDGE_DEDUPE_MAX_FACTS),
        drizzle
          .select({ id: schema.agents.id, name: schema.agents.name })
          .from(schema.agents)
          .where(eq(schema.agents.userId, req.user.id))
          .limit(500),
      ]);
      if (!rows || rows.length < 2) {
        return res.json({
          clusters: [],
          total_analyzed: rows?.length || 0,
          message: "Not enough facts to dedupe.",
        });
      }
      const agentMap = new Map(
        (agentList || []).map((a: { id: string; name: string }) => [a.id, a.name]),
      );
      const result = await claudeBrain.findKnowledgeDuplicates({
        facts: rows.map((r: any) => ({
          id: Number(r.id),
          agent_name: agentMap.get(r.agentId || "") || "(unknown)",
          content: r.content,
        })),
      });
      const validIds = new Set(rows.map((r: any) => r.id));
      const safe = (result.clusters || [])
        .map((c: any) => ({
          ...c,
          members: (c.members || []).filter((m: any) => validIds.has(m.id)),
        }))
        .filter(
          (c: any) =>
            c.members.length >= 2 &&
            validIds.has(c.recommended_keep_id) &&
            c.members.some((m: any) => m.id === c.recommended_keep_id),
        );
      res.json({
        clusters: safe,
        total_analyzed: result.total_analyzed ?? rows.length,
        truncated: rows.length === KNOWLEDGE_DEDUPE_MAX_FACTS,
      });
    } catch (e) {
      claudeErr(res, e);
    }
  },
);

router.post("/enrich-lead", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!claudeBrain.isClaudeAvailable()) {
      return res
        .status(503)
        .json({ error: "Claude required for lead enrichment.", code: "CLAUDE_OFFLINE" });
    }
    const customer_number = (req.body?.customer_number || req.body?.phone || "").toString().trim();
    if (!customer_number) {
      return res.status(400).json({ error: "customer_number is required." });
    }
    const enrichment = await claudeBrain.enrichLead({
      customer_number,
      customer_name:
        (req.body?.customer_name || req.body?.name || "").toString().slice(0, 200) || null,
      context: (req.body?.context || "").toString().slice(0, 4000) || null,
      industry_hint: (req.body?.industry_hint || "").toString().slice(0, 200) || null,
    });
    res.json({ enrichment });
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post("/forge", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { goal, industry, companyName, websiteUrl, voicePreference } = req.body;
    if (!goal) return res.status(400).json({ error: "goal required." });
    const result = await claudeBrain.forgeAgent({
      goal,
      industry,
      companyName,
      websiteUrl,
      voicePreference,
    });
    res.json({ design: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

router.post("/forge/create", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { design, websiteUrl } = req.body;
    if (!design || !design.name)
      return res.status(400).json({ error: "design with name required." });

    const agentId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    await drizzle.insert(schema.agents).values({
      id: agentId,
      userId: req.user.id,
      name: design.name,
      archetype: design.archetype || "Receptionist",
      firstMessage: design.first_message || `Hi, this is ${design.name}. How can I help?`,
      websiteUrl: websiteUrl || null,
      channel: "voice",
    });

    if (design.personality_block) {
      await drizzle
        .insert(schema.personality)
        .values({
          agentId: agentId,
          userId: req.user.id,
          content: design.personality_block,
        })
        .onConflictDoUpdate({
          target: schema.personality.agentId,
          set: { content: design.personality_block, userId: req.user.id },
        });
    }

    const directiveRows = (design.directives || []).map((d: any) => ({
      agentId: agentId,
      userId: req.user.id,
      content: d.content,
      priority: d.priority ?? 5,
    }));
    if (directiveRows.length) await drizzle.insert(schema.directives).values(directiveRows);

    const knowledgeRows = (design.seed_knowledge || []).map((k: string) => ({
      agentId: agentId,
      userId: req.user.id,
      content: k,
    }));
    if (knowledgeRows.length) await drizzle.insert(schema.knowledge).values(knowledgeRows);

    res.json({ success: true, agentId });
  } catch (e) {
    claudeErr(res, e);
  }
});

/**
 * /api/claude/coach-step — critique a flow-composer step in isolation.
 *
 * Operators editing the workflow composer can click "Ask Claude" on
 * any step and get an opinionated critique: clarity, missing edge
 * cases, transition ambiguity, redundancy, tone risks. No call data
 * needed (unlike /agent-review which works on completed calls).
 *
 * Output is plain text — the composer renders it inline below the
 * step editor. Bounded at ~300 tokens so it fits without scrolling.
 */
router.post("/coach-step", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, instructions, transitionCondition, isEndNode } = req.body ?? {};
    if (typeof name !== "string" || typeof instructions !== "string") {
      return res.status(400).json({ error: "name + instructions required" });
    }
    if (instructions.trim().length < 5) {
      return res.status(400).json({ error: "instructions too short to critique" });
    }

    const stepLabel = name.trim() || "(unnamed stage)";
    const transitionLine = isEndNode
      ? "This is the end stage — no transition. The agent hangs up after completing this."
      : `Transition to next stage when: ${transitionCondition || "(no condition specified — flag this as ambiguous)"}`;

    const system = `You are a senior conversation designer reviewing a single stage of an AI voice agent's call flow. The operator is going to ship this to real callers.

Critique this ONE stage. Be specific and practical. Cover:
1. CLARITY — would a new agent know exactly what to say and not say?
2. EDGE CASES — what likely caller responses does the stage NOT handle?
3. TRANSITION — is the trigger for moving to the next stage unambiguous?
4. TONE/PACING — too long, too short, too pushy, too vague?
5. ONE concrete suggestion to improve.

Format your reply as 4-5 short bullet points, each starting with a label like "Clarity:", "Edge case:", "Transition:", "Suggested rewrite:". Max ~250 words total. Direct, no preamble.`;

    const user = `STAGE NAME: ${stepLabel}

INSTRUCTIONS THE AGENT FOLLOWS:
${instructions.trim()}

${transitionLine}

Critique this stage.`;

    const result = await claudeBrain.runCompletion({
      system,
      user,
      complexity: "complex",
      maxTokens: 500,
    });
    res.json({ critique: result.text });
  } catch (e) {
    claudeErr(res, e);
  }
});

export default router;
