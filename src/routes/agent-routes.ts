import { Router, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";

import { log, auditLogger, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, sanitizeForAudit } from "../lib/server-utils";
import { parseFormData, AgentFormSchema, AgentBusinessProfileSchema, GeminiAgentExtractionSchema } from "../lib/form-validators";
import { ROLE_PERSONALITY_TEMPLATES, DEFAULT_AGENT_ROLE } from "../lib/agent-constants";
import * as claudeBrain from "../lib/claude-brain";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { computeAgentPerformance, emptyAgentPerformance } from "../lib/agent-performance";
import { computeScorecard } from "../lib/agent-scorecard";
import { SentryEvents } from "../lib/sentry-events";
import { normalizeEnabledTools } from "../lib/agent-capabilities";
import { claudeErr } from "../lib/claude-response-helpers";

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "placeholder_gemini_key");

const isMissingRoleColumnError = (error: any) =>
  typeof error?.message === "string" &&
  error.message.includes("Could not find the 'role' column of 'wireline_agents'");


router.get("/api/agents", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentsList = await drizzle
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.userId, req.user.id))
      .orderBy(desc(schema.agents.createdAt))
      .limit(500);
    res.json({ agents: agentsList });
  } catch (error: any) {
    log.warn("Failed to fetch agents", { userId: req.user.id, error: getErrorMessage(error) });
    res.json({ agents: [] }); 
  }
});

router.get("/api/agents/roles", (_req, res) => {
  res.json({
    roles: [
      { value: "sales",            label: "Sales",              description: "Closes deals and drives revenue",           color: "amber" },
      { value: "customer_service", label: "Customer Service",   description: "Handles inbound issues and support",        color: "emerald" },
      { value: "scheduler",        label: "Scheduler",          description: "Books appointments and manages calendars",  color: "violet" },
      { value: "collections",      label: "Collections",        description: "Handles payment follow-ups and recovery",   color: "rose" },
      { value: "technical_support",label: "Technical Support",  description: "Diagnoses and resolves technical issues",   color: "blue" },
      { value: "lead_qualifier",   label: "Lead Qualifier",     description: "Screens and scores inbound prospects",      color: "orange" },
      { value: "receptionist",     label: "Receptionist",       description: "Routes calls and creates first impressions",color: "cyan" },
      { value: "marketing",        label: "Marketing",          description: "Nurtures prospects and runs campaigns",     color: "purple" },
    ],
    templates: ROLE_PERSONALITY_TEMPLATES
  });
});

router.post("/api/agents/:id/apply-role", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { role } = req.body;
    const template = ROLE_PERSONALITY_TEMPLATES[role as keyof typeof ROLE_PERSONALITY_TEMPLATES];
    if (!template) return res.status(400).json({ error: "Unknown role" });

    // SECURITY: verify the agent belongs to the caller before upserting.
    // We use the service-role client (bypasses RLS) so without this check
    // a user could overwrite another user's agent's personality by
    // guessing the agent_id (and the upsert's onConflict: 'agent_id'
    // would even reassign ownership via the user_id field).
    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.id, req.params.id),
          eq(schema.agents.userId, req.user.id)
        )
      )
      .limit(1);
    
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    await drizzle
      .insert(schema.personality)
      .values({ agentId: req.params.id, userId: req.user.id, content: template })
      .onConflictDoUpdate({
        target: schema.personality.agentId,
        set: { content: template }
      });

    res.json({ success: true, content: template });
  } catch (error) {
    log.error("Failed to apply role template", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to apply role template" });
  }
});

router.get("/api/agents/:id/export", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    const [agentRes, personalityRes, directivesRes, knowledgeRes] = await Promise.all([
      drizzle.select().from(schema.agents).where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId))).limit(1),
      drizzle.select({ content: schema.personality.content }).from(schema.personality).where(eq(schema.personality.agentId, agentId)).limit(1),
      drizzle.select({ content: schema.directives.content, priority: schema.directives.priority }).from(schema.directives).where(and(eq(schema.directives.agentId, agentId), eq(schema.directives.userId, userId))).limit(500),
      drizzle.select({ content: schema.knowledge.content }).from(schema.knowledge).where(and(eq(schema.knowledge.agentId, agentId), eq(schema.knowledge.userId, userId))).limit(500),
    ]);

    const agentData = agentRes[0];
    if (!agentData) return res.status(404).json({ error: 'Agent not found' });

    const exportData = {
      wireline_export_version: 1,
      exported_at: new Date().toISOString(),
      agent: {
        name: agentData.name,
        channel: agentData.channel,
        role: agentData.role,
        enabled_tools: agentData.enabledTools ?? null,
        personality: personalityRes[0]?.content ?? '',
        directives: (directivesRes ?? []).map((d: { content: string; priority: number | null }) => ({ content: d.content, priority: d.priority })),
        knowledge: (knowledgeRes ?? []).map((k: { content: string }) => k.content),
      },
    };

    const safeName = agentData.name
      .replace(/[^\w\s-]/g, '')   // strip non-word chars (quotes, newlines, path chars)
      .replace(/\s+/g, '_')
      .slice(0, 64)
      || 'agent';
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_config.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch {
    res.status(500).json({ error: 'Export failed' });
  }
});

router.post("/api/agents/:id/import", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;
    const payload = req.body;

    // Validate structure
    if (!payload?.wireline_export_version || !payload?.agent) {
      return res.status(400).json({ error: 'Invalid export file format' });
    }

    const [ownedAgent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1);
    if (!ownedAgent) return res.status(404).json({ error: 'Agent not found' });

    const { personality, directives, knowledge, role, channel, enabled_tools } = payload.agent;

    if (personality) {
      await drizzle
        .insert(schema.personality)
        .values({ agentId, userId, content: personality })
        .onConflictDoUpdate({
          target: schema.personality.agentId,
          set: { content: personality }
        });
    }

    if (Array.isArray(directives) && directives.length > 0) {
      await drizzle
        .insert(schema.directives)
        .values(
          directives.map((d: { content: string; priority?: number }) => ({ 
            agentId, 
            userId, 
            content: d.content, 
            priority: d.priority ?? 5 
          }))
        );
    }

    if (Array.isArray(knowledge) && knowledge.length > 0) {
      await drizzle
        .insert(schema.knowledge)
        .values(
          knowledge.map((k: string) => ({ 
            agentId, 
            userId, 
            content: k 
          }))
        );
    }

    const toolConfig = enabled_tools === null ? null : normalizeEnabledTools(enabled_tools);
    const importedAgentPatch: any = {};
    if (typeof role === 'string') importedAgentPatch.role = role;
    if (typeof channel === 'string') importedAgentPatch.channel = channel;
    if (enabled_tools !== undefined) importedAgentPatch.enabledTools = toolConfig;
    if (Object.keys(importedAgentPatch).length > 0) {
      await drizzle
        .update(schema.agents)
        .set(importedAgentPatch)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)));
    }

    const imported = {
      personality: !!personality,
      directives: directives?.length ?? 0,
      knowledge: knowledge?.length ?? 0,
    };

    res.json({ success: true, imported });
  } catch {
    res.status(500).json({ error: 'Import failed' });
  }
});

router.get("/api/agent-config/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    const [personalityRow, directivesList, knowledgeList] = await Promise.all([
      drizzle.select({ content: schema.personality.content }).from(schema.personality).where(eq(schema.personality.agentId, agentId)).limit(1),
      drizzle.select().from(schema.directives).where(and(eq(schema.directives.agentId, agentId), eq(schema.directives.userId, userId))).orderBy(desc(schema.directives.priority)),
      drizzle.select().from(schema.knowledge).where(and(eq(schema.knowledge.agentId, agentId), eq(schema.knowledge.userId, userId))).orderBy(desc(schema.knowledge.createdAt)),
    ]);

    res.json({
      personality: personalityRow[0]?.content || '',
      directives: directivesList || [],
      knowledge: knowledgeList || []
    });
  } catch (error) {
    log.error("Config fetch error", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to load agent configuration" });
  }
});

router.post("/api/agent-config/:id/manual", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, content, overrideId } = req.body;
    const agentId = req.params.id;
    const userId = req.user.id;

    if (!content) return res.status(400).json({ error: "Content is required" });

    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    if (type === 'personality') {
       await drizzle
         .insert(schema.personality)
         .values({ agentId, content, userId })
         .onConflictDoUpdate({
           target: schema.personality.agentId,
           set: { content }
         });
    } else if (type === 'directive') {
       if (overrideId) {
          await drizzle.update(schema.directives).set({ content }).where(and(eq(schema.directives.id, BigInt(overrideId)), eq(schema.directives.userId, userId)));
       } else {
          await drizzle.insert(schema.directives).values({ agentId, content, priority: 5, userId });
       }
    } else if (type === 'knowledge') {
       if (overrideId) {
          await drizzle.update(schema.knowledge).set({ content }).where(and(eq(schema.knowledge.id, BigInt(overrideId)), eq(schema.knowledge.userId, userId)));
       } else {
          await drizzle.insert(schema.knowledge).values({ agentId, content, userId });
       }
    } else {
       return res.status(400).json({ error: "Invalid type — must be personality, directive, or knowledge" });
    }

    res.json({ success: true });
  } catch (error) {
    log.error("Manual config error", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update" });
  }
});

router.delete("/api/agent-config/:id/:type/:rowId", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { type, rowId } = req.params;
      const userId = req.user.id;
      if (type === 'directive') await drizzle.delete(schema.directives).where(and(eq(schema.directives.id, BigInt(rowId)), eq(schema.directives.userId, userId)));
      if (type === 'knowledge') await drizzle.delete(schema.knowledge).where(and(eq(schema.knowledge.id, BigInt(rowId)), eq(schema.knowledge.userId, userId)));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete" });
    }
 });

// /api/train/extract — Claude-first (Gemini fallback) extraction of
// directives, knowledge, and personality from a free-text operator message.
// Saves the extracted data immediately, then returns a formatted confirmation
// so the client can update the chat UI without a second round-trip.
router.post("/api/train/extract", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const { message, agentId = "default-agent" } = req.body;
  const userId = req.user.id;
  if (!message?.trim()) return res.status(400).json({ error: "message is required" });

  let parsed: { directives: Array<{ content: string; priority?: number }>; knowledge: Array<{ content: string }>; personality: string } = {
    directives: [], knowledge: [], personality: ""
  };

  // ── Claude path ───────────────────────────────────────────────────
  if (claudeBrain.isClaudeAvailable()) {
    try {
      const extractionTool = {
        name: "extract_training_data",
        description: "Extract operational directives, knowledge facts, and personality updates from operator input.",
        input_schema: {
          type: "object",
          properties: {
            directives: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string", description: "A hard rule the agent must follow." },
                  priority: { type: "integer", minimum: 1, maximum: 10, description: "1=low, 10=critical." }
                },
                required: ["content", "priority"],
                additionalProperties: false
              },
              description: "Rules the agent must always obey. Only include if the input contains explicit behavioral rules."
            },
            knowledge: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string", description: "A factual statement about the business." }
                },
                required: ["content"],
                additionalProperties: false
              },
              description: "Facts about the business (hours, pricing, services, policies). Only include if the input contains concrete facts."
            },
            personality: {
              type: "string",
              description: "Updated personality / tone instruction. Only include if the operator is explicitly requesting a tone or style change; otherwise use an empty string."
            }
          },
          required: ["directives", "knowledge", "personality"],
          additionalProperties: false
        }
      } as any;

      parsed = await claudeBrain.runStructured({
        system: `You are the Wireline Configuration Engine. A business operator is training an AI agent (ID: ${agentId}). Extract structured configuration from their message. Be conservative — only extract information that is clearly intended as a directive, a knowledge fact, or a personality change. If the input is conversational or ambiguous, return empty arrays and an empty personality string.`,
        user: message,
        tool: extractionTool,
        maxTokens: 1024,
      });
    } catch (err) {
      log.error("Claude extraction failed; falling back to Gemini", { error: getErrorMessage(err) });
    }
  }

  // ── Gemini fallback ───────────────────────────────────────────────
  const noDataExtracted = !parsed.directives.length && !parsed.knowledge.length && !parsed.personality;
  if (noDataExtracted) {
    try {
      const prompt = `
You are the Wireline Configuration Engine. A business owner is training their AI fleet.
Current Training Target: ${agentId}
User Message: "${message}"

Extract any new instructions, rules, or knowledge from the message.
Categorize them as:
- DIRECTIVE: A hard rule the agent must follow (e.g. "Never give out personal cell numbers").
- KNOWLEDGE: A fact about the business (e.g. "We are closed on Sundays").
- PERSONALITY: A request regarding tone or style (e.g. "Be more enthusiastic and upbeat").

Respond ONLY in strict, valid JSON format (no markdown):
{"directives":[{"content":"...","priority":5}],"knowledge":[{"content":"..."}],"personality":""}`;

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });
      const geminiRes = await model.generateContent(prompt);
      const geminiRaw = JSON.parse(geminiRes.response.text() || "{}");
      const geminiResult = GeminiAgentExtractionSchema.safeParse(geminiRaw);
      if (geminiResult.success) {
        parsed = geminiResult.data;
      } else {
        log.warn("Gemini agent extraction response did not match expected schema", { issues: geminiResult.error.issues });
        parsed = {
          directives: [],
          knowledge: [],
          personality: "",
        };
      }
    } catch (err) {
      log.error("Gemini extraction fallback failed", { error: getErrorMessage(err) });
    }
  }

  // ── Persist ───────────────────────────────────────────────────────
  try {
    if (parsed.directives.length) {
      await drizzle
        .insert(schema.directives)
        .values(
          parsed.directives.map((d: { content: string; priority?: number }) => ({ 
            content: d.content, 
            priority: d.priority ?? 5, 
            agentId, 
            userId 
          }))
        );
    }
    if (parsed.knowledge.length) {
      await drizzle
        .insert(schema.knowledge)
        .values(
          parsed.knowledge.map((k: { content: string }) => ({ 
            content: k.content, 
            agentId, 
            userId 
          }))
        );
    }
    if (parsed.personality) {
      await drizzle
        .insert(schema.personality)
        .values({
          agentId,
          userId,
          content: parsed.personality,
        })
        .onConflictDoUpdate({
          target: schema.personality.agentId,
          set: { content: parsed.personality }
        });
    }
  } catch (err) {
    log.error("Training persistence failed", { error: getErrorMessage(err) });
    return res.status(500).json({ error: "Failed to save training data" });
  }

  // ── Format confirmation message ───────────────────────────────────
  let responseContent = "MODIFICATIONS SYNCED TO MISSION CONTROL.\n\n";
  if (parsed.directives.length) {
    responseContent += `ADDED ${parsed.directives.length} OPERATIONAL DIRECTIVE(S):\n`;
    responseContent += parsed.directives.map((d: any) => `> [PRIORITY ${d.priority ?? 5}] ${d.content}`).join("\n") + "\n\n";
  }
  if (parsed.knowledge.length) {
    responseContent += `SYNCED ${parsed.knowledge.length} INTELLIGENCE FACT(S):\n`;
    responseContent += parsed.knowledge.map((k: any) => `> ${k.content}`).join("\n") + "\n\n";
  }
  if (parsed.personality) {
    responseContent += `UPDATED NEURAL PERSONALITY:\n> ${parsed.personality}`;
  }
  if (!parsed.directives.length && !parsed.knowledge.length && !parsed.personality) {
    responseContent = "INPUT ANALYZED. NO NEW DIRECTIVES DETECTED. PLEASE SPECIFY CONCRETE OPERATIONAL RULES OR KNOWLEDGE ENTRY.";
  }

  res.json({ success: true, responseContent, directives: parsed.directives, knowledge: parsed.knowledge, personality: parsed.personality });
});

router.post("/api/train/save", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const { extracted, agentId = "default-agent" } = req.body;
  const userId = req.user.id;
  
  try {
    const parsed = extracted || {};

    if (parsed.directives && parsed.directives.length) {
      await drizzle
        .insert(schema.directives)
        .values(
          parsed.directives.map((d: { content: string; priority?: number }) => ({ 
            ...d, 
            agentId, 
            userId 
          }))
        );
    }
    if (parsed.knowledge && parsed.knowledge.length) {
      await drizzle
        .insert(schema.knowledge)
        .values(
          parsed.knowledge.map((k: { content: string }) => ({ 
            ...k, 
            agentId, 
            userId 
          }))
        );
    }
    if (parsed.personality) {
      await drizzle
        .insert(schema.personality)
        .values({ 
          agentId, 
          userId,
          content: parsed.personality
        })
        .onConflictDoUpdate({
          target: schema.personality.agentId,
          set: { content: parsed.personality }
        });
    }

    res.json({ success: true });
  } catch (error) {
    log.error("Training save error", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to save intelligence patterns" });
  }
});

router.post("/api/agents", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate input using Zod schema
    const validation = parseFormData(AgentFormSchema, {
      name: req.body.name,
      role: req.body.role,
      personality: req.body.personality
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    // SECURITY ENFORCEMENT: Check Subscription Status for this specific user
    const [userSettings] = await drizzle
      .select({ subscriptionStatus: schema.settings.subscriptionStatus, maxAgents: schema.settings.maxAgents })
      .from(schema.settings)
      .where(eq(schema.settings.userId, req.user.id))
      .limit(1);

    // Gating mechanism: Prevent agent creation if the account is unpaid
    const subscriptionStatus = userSettings?.subscriptionStatus || 'active';
    if (subscriptionStatus !== 'active') {
       return res.status(403).json({ error: "Access Denied: Please upgrade your billing plan." });
    }

    // Agent Limit Check
    const maxAgents = userSettings?.maxAgents || 3;
    const [{ count }] = await drizzle
      .select({ count: sql`count(*)` })
      .from(schema.agents)
      .where(eq(schema.agents.userId, req.user.id));
    
    const agentCount = Number(count);

    if (agentCount >= maxAgents) {
      return res.status(403).json({ error: `Quota Exceeded: Your plan only allows ${maxAgents} agents.` });
    }

    const { id, voice_id, channel } = req.body;
    if (!validation.data) throw new Error('Validation data missing after success check');
    const { name, role, personality } = validation.data;
    const agentRole = role || DEFAULT_AGENT_ROLE;
    const agentId = id || `agent-${Date.now()}`;
    try {
      await drizzle.insert(schema.agents).values({
        id: agentId,
        userId: req.user.id,
        name,
        voiceId: voice_id || 'bIHbv24MWmeRgasZH58o',
        channel: channel || 'voice',
        role: agentRole
      });
    } catch (error: any) {
      log.error("Agent row insert failed", {
        userId: req.user.id,
        agentId,
        error: error.message,
      });
      return res.status(500).json({ error: "Failed to create agent" });
    }

    // Use provided personality or fall back to role-appropriate template
    const personalityContent = personality
      || ROLE_PERSONALITY_TEMPLATES[agentRole as keyof typeof ROLE_PERSONALITY_TEMPLATES]
      || (channel === 'email'
        ? "You are a professional email agent specialized in clear, efficient communication."
        : "You are a helpful assistant serving as a phone agent.");

    try {
      await drizzle.insert(schema.personality).values({
        agentId: agentId,
        userId: req.user.id,
        content: personalityContent
      });
    } catch (error: any) {
      log.error("Agent personality insert failed", {
        userId: req.user.id,
        agentId,
        error: error.message,
      });
      await drizzle.delete(schema.agents).where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)));
      return res.status(500).json({ error: "Failed to create agent" });
    }
    
    // Audit log: agent creation
    void auditLogger.logAgentOperation('created', {
      userId: req.user.id,
      agentId,
      agentName: name,
      metadata: { channel: channel || 'voice', archetype: agentRole },
      ip: req.ip
    }).catch((err: unknown) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    res.json({ success: true, id: agentId });
  } catch (error) {
    log.error("Agent creation failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to create agent" });
  }
});

router.put("/api/agents/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate core fields using Zod schema
    const validation = parseFormData(AgentFormSchema, {
      name: req.body.name,
      role: req.body.role,
      personality: req.body.personality
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    // Validate the optional business-profile block. Each field is
    // optional so partial updates work; unknown fields are rejected
    // (strict mode) so callers can't sneak in arbitrary columns.
    const profileFields = [
      'business_hours',
      'timezone',
      'compliance_mode',
      'disallowed_topics',
      'escalation_keywords',
      'business_variables',
      'out_of_hours_message',
      'kpi_focus',
    ] as const;
    const profileInput: Record<string, unknown> = {};
    for (const k of profileFields) {
      if (req.body[k] !== undefined) profileInput[k] = req.body[k];
    }
    const profileValidation = parseFormData(AgentBusinessProfileSchema, profileInput);
    if (!profileValidation.success) {
      return res.status(400).json({ error: "Validation failed", errors: profileValidation.errors });
    }

    const enabledToolsRaw = req.body.enabled_tools;
    const enabledTools = enabledToolsRaw === null ? null : normalizeEnabledTools(enabledToolsRaw);
    if (enabledToolsRaw !== undefined && enabledToolsRaw !== null && enabledTools === null) {
      return res.status(400).json({ error: "enabled_tools must be an array of supported tool names" });
    }

    const { name, role, personality } = validation.data!;
    const { voice_id, voice_id_inbound, voice_id_outbound, voice_provider, first_message, archetype, ambient_noise, website_url, transfer_phone, email_auto_respond, email_agent_tone, email_signature, channel, autonomy_level, channels, slack_channel_id, auto_zoom_link } = req.body;

    // Validate autonomy_level if provided
    const VALID_AUTONOMY = ["inherit", "auto", "draft", "supervised"];
    if (autonomy_level !== undefined && !VALID_AUTONOMY.includes(autonomy_level)) {
      return res.status(400).json({ error: `autonomy_level must be one of: ${VALID_AUTONOMY.join(", ")}` });
    }

    // Validate channels if provided
    const VALID_CHANNELS = ["voice", "email", "sms"];
    if (channels !== undefined) {
      if (!Array.isArray(channels) || !channels.every((c: string) => VALID_CHANNELS.includes(c))) {
        return res.status(400).json({ error: `channels must be an array containing: ${VALID_CHANNELS.join(", ")}` });
      }
    }

    // Build the update payload — start with core fields, then merge
    // any business-profile fields the caller actually sent (so a
    // partial PATCH-style update doesn't clobber existing hours / mode
    // / variables when the caller is only changing the agent's name).
    const update: any = {
      name,
      voiceId: voice_id,
      voiceIdInbound: voice_id_inbound,
      voiceIdOutbound: voice_id_outbound,
      voiceProvider: voice_provider,
      firstMessage: first_message,
      archetype,
      ambientNoise: ambient_noise,
      websiteUrl: website_url,
      transferPhone: transfer_phone,
      emailAutoRespond: email_auto_respond,
      emailAgentTone: email_agent_tone,
      emailSignature: email_signature,
      channel,
      role,
    };
    if (autonomy_level !== undefined) update.autonomyLevel = autonomy_level;
    if (channels !== undefined) update.channels = channels;
    if (slack_channel_id !== undefined) update.slackChannelId = slack_channel_id;
    if (auto_zoom_link !== undefined) update.autoZoomLink = auto_zoom_link;
    if (profileValidation.data) {
      for (const k of profileFields) {
        if ((profileValidation.data as any)[k] !== undefined) {
          // Map snake_case profile keys to camelCase if they are in schema
          const mappedKey = k.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
          update[mappedKey] = (profileValidation.data as any)[k];
        }
      }
    }
    if (enabledToolsRaw !== undefined) {
      update.enabledTools = enabledTools;
    }
    // personality is not stored on the agent row — it lives in
    // wireline_personality. The caller passes it in for the AgentForm
    // contract, but we only care that it validated.
    void personality;

    await drizzle
      .update(schema.agents)
      .set(update)
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));

    // Audit log: agent update (sanitize sensitive fields)
    void auditLogger.logAgentOperation('updated', {
      userId: req.user.id,
      agentId: req.params.id,
      metadata: { changes: sanitizeForAudit(req.body) },
      ip: req.ip
    }).catch((err: unknown) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update agent", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update agent" });
  }
});

router.delete("/api/agents/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1);

    if (!agent) return res.status(404).json({ error: "Agent not found." });

    // Null-out agent_id on tables that would otherwise block the delete.
    await Promise.allSettled([
      drizzle.update(schema.callLogs).set({ agentId: null }).where(and(eq(schema.callLogs.agentId, agentId), eq(schema.callLogs.userId, userId))),
      drizzle.update(schema.appointments).set({ agentId: null }).where(and(eq(schema.appointments.agentId, agentId), eq(schema.appointments.userId, userId))),
      drizzle.update(schema.outboundLeads).set({ agentId: null }).where(and(eq(schema.outboundLeads.agentId, agentId), eq(schema.outboundLeads.userId, userId))),
      drizzle.update(schema.fleetTasks).set({ agentId: null }).where(and(eq(schema.fleetTasks.agentId, agentId), eq(schema.fleetTasks.userId, userId))),
      drizzle.update(schema.phoneNumbers).set({ agentId: null }).where(and(eq(schema.phoneNumbers.agentId, agentId), eq(schema.phoneNumbers.userId, userId))),
      drizzle.update(schema.signalPresence).set({ agentId: null }).where(and(eq(schema.signalPresence.agentId, agentId), eq(schema.signalPresence.userId, userId))),
    ]);

    // Delete the agent row — CASCADE handles directives, knowledge,
    // personality, and lessons automatically.
    await drizzle.delete(schema.agents).where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)));

    log.info("agent deleted", { agentId, userId });
    
    // Audit log: agent deletion
    void auditLogger.logAgentOperation('deleted', {
      userId: req.user.id,
      agentId: agentId,
      ip: req.ip
    }).catch((err: unknown) => log.warn('audit log failed', { error: getErrorMessage(err) }));
    
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete agent", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete agent." });
  }
});

router.post("/api/agents/:id/optimize", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
   try {
    const { id } = req.params;
    const logs = await drizzle
       .select({ summary: schema.callLogs.summary, transcript: schema.callLogs.transcript, leadScore: schema.callLogs.leadScore, intentLabel: schema.callLogs.intentLabel })
       .from(schema.callLogs)
       .where(and(eq(schema.callLogs.agentId, id), eq(schema.callLogs.userId, req.user.id)))
       .orderBy(desc(schema.callLogs.createdAt))
       .limit(10);

    if (!logs || logs.length === 0) {
       return res.json({ suggestions: [], reason: "Insufficient data: Need at least 1 completed mission log." });
    }

      // Claude path — uses the same agent-review tool as /api/claude/agent-review,
      // but flattens the response to {suggestions, analysis} for legacy callers.
      if (claudeBrain.isClaudeAvailable()) {
         try {
            const [agent] = await drizzle
               .select({ name: schema.agents.name, archetype: schema.agents.archetype, role: schema.agents.role })
               .from(schema.agents)
               .where(and(eq(schema.agents.id, id), eq(schema.agents.userId, req.user.id)))
               .limit(1);
            const review = await claudeBrain.agentReview({
               agentName: agent?.name || 'Wireline Agent',
               archetype: agent?.archetype || 'Receptionist',
               role: agent?.role || DEFAULT_AGENT_ROLE,
               callLogs: logs as any,
            });
            return res.json({
               suggestions: (review.suggested_directives || []).slice(0, 3).map((d: { directive?: string }) => d.directive),
               analysis: review.executive_summary,
               full_review: review,
            });
         } catch (err) {
            log.error("Claude optimize failed; falling back to Gemini", { error: getErrorMessage(err) });
         }
      }

      // Legacy Gemini fallback
      const prompt = `
        AGENT ID: ${id}
        MISSION LOGS (LAST 10):
        ${logs.map((l, i) => `Log ${i+1}: Summary: ${l.summary}. Transcript: ${l.transcript}`).join('\n\n')}

        TASK: Analyze performance and suggest exactly 3 new tactical directives to improve the agent.
        FORMAT: JSON { "suggestions": string[], "analysis": string }
      `;

      const model = genAI.getGenerativeModel({
         model: "gemini-1.5-pro",
         generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(prompt);
      const aiText = result.response.text();
      let parsed: any = {};
      try { parsed = JSON.parse(aiText || "{}"); } catch {
        return res.status(502).json({ error: "Optimizer returned malformed JSON." });
      }
      res.json(parsed);
   } catch {
      res.status(500).json({ error: "Optimization protocol failed" });
   }
});

router.get("/api/agents/:id/performance", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.id;
    const logs = await drizzle
      .select({ 
        id: schema.callLogs.id, 
        leadScore: schema.callLogs.leadScore, 
        durationSeconds: schema.callLogs.durationSeconds, 
        sentiment: schema.callLogs.sentiment, 
        createdAt: schema.callLogs.createdAt 
      })
      .from(schema.callLogs)
      .where(and(eq(schema.callLogs.agentId, agentId), eq(schema.callLogs.userId, req.user.id)))
      .orderBy(desc(schema.callLogs.createdAt))
      .limit(500);

    res.json(computeAgentPerformance({ rows: logs || [] }));
  } catch (e: any) {
    log.error("Agent performance error", { error: e?.message });
    res.json(emptyAgentPerformance());
  }
});

router.get("/api/agents/:id/scorecard", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    // Bound the window to a sensible range. Default 30; cap at 365 so a
    // single dashboard page can't trigger a year-over-year scan by accident.
    const daysRaw = parseInt(req.query.days as string);
    const days = Math.min(Math.max(Number.isFinite(daysRaw) ? daysRaw : 30, 1), 365);

    // Verify ownership AND read kpi_focus in one shot.
    const [agent] = await drizzle
      .select({ id: schema.agents.id, kpiFocus: schema.agents.kpiFocus })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const focus: string = agent.kpiFocus || 'general';

    const now = Date.now();
    const windowMs = days * 24 * 60 * 60 * 1000;
    const periodStart = new Date(now - windowMs).toISOString();
    const priorStart  = new Date(now - 2 * windowMs).toISOString();

    const [currentLogs, priorLogs, appts, openTasks] = await Promise.all([
      drizzle.select().from(schema.callLogs).where(and(eq(schema.callLogs.agentId, agentId), eq(schema.callLogs.userId, userId), sql`${schema.callLogs.createdAt} >= ${periodStart}`)).orderBy(desc(schema.callLogs.createdAt)).limit(2000),
      drizzle.select().from(schema.callLogs).where(and(eq(schema.callLogs.agentId, agentId), eq(schema.callLogs.userId, userId), sql`${schema.callLogs.createdAt} >= ${priorStart} AND ${schema.callLogs.createdAt} < ${periodStart}`)).limit(2000),
      drizzle.select({ id: schema.appointments.id, createdAt: schema.appointments.createdAt }).from(schema.appointments).where(and(eq(schema.appointments.agentId, agentId), eq(schema.appointments.userId, userId), sql`${schema.appointments.createdAt} >= ${periodStart}`)).limit(2000),
      drizzle.select({ id: schema.fleetTasks.id, sourceId: schema.fleetTasks.sourceId, sourceType: schema.fleetTasks.sourceType, createdAt: schema.fleetTasks.createdAt }).from(schema.fleetTasks).where(and(eq(schema.fleetTasks.agentId, agentId), eq(schema.fleetTasks.userId, userId), sql`${schema.fleetTasks.createdAt} >= ${periodStart}`, eq(schema.fleetTasks.sourceType, 'phone_call'))).limit(2000),
    ]);

    // Hand the rows to the pure scorecard math (src/lib/agent-scorecard.ts)
    // so the per-focus metric definitions are unit-tested in isolation.
    const result = computeScorecard({
      focus,
      windowDays: days,
      now,
      currentLogs: currentLogs || [],
      priorLogs:   priorLogs || [],
      appointments: appts || [],
      openFollowUps: openTasks || [],
    });

    res.json(result);
  } catch (e: any) {
    log.error("Agent scorecard error", { error: getErrorMessage(e) });
    res.status(500).json({ error: 'Failed to compute scorecard' });
  }
});

router.get("/api/agents/:id/lessons", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
   try {
      const lessons = await drizzle
         .select()
         .from(schema.agentLessons)
         .where(and(eq(schema.agentLessons.agentId, req.params.id), eq(schema.agentLessons.userId, req.user.id)))
         .orderBy(desc(schema.agentLessons.createdAt))
         .limit(200);
      res.json({ lessons });
   } catch {
      res.status(500).json({ error: "Failed to fetch lessons" });
   }
});

router.post("/api/agents/:id/promote", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
   try {
      const { lessonId, content } = req.body;
      const agentId = req.params.id;

      // SECURITY: verify the caller owns the target agent before inserting
      // a directive against it. Without this, an attacker could promote a
      // lesson into another user's agent's directives.
      const [ownedAgent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!ownedAgent) return res.status(404).json({ error: "Agent not found" });

      // Validate content shape — keeps the directive within table limits.
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: "content is required" });
      }
      if (content.length > 1000) {
        return res.status(400).json({ error: "content must be 1000 characters or less" });
      }

      // Insert into wireline_directives (the table that agent-config reads from).
      // Priority 5 = medium on the 1-10 scale used throughout the app.
      await drizzle.insert(schema.directives).values({
         agentId: agentId,
         content: content.trim(),
         priority: 5,
         userId: req.user.id
      });

      // Delete the lesson after promotion — verify ownership first
      await drizzle.delete(schema.agentLessons)
         .where(and(eq(schema.agentLessons.id, BigInt(lessonId)), eq(schema.agentLessons.userId, req.user.id)));

      // Track agent optimization when lessons are promoted to directives
      SentryEvents.agentOptimized({
        agent_id: agentId,
        metric_improved: 'instruction_baseline',
      });

      res.json({ success: true });
   } catch {
      res.status(500).json({ error: "Promotion failed" });
   }
});

router.delete("/api/agents/:id/lessons/:lessonId", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
   try {
      await drizzle.delete(schema.agentLessons)
         .where(and(eq(schema.agentLessons.id, BigInt(req.params.lessonId)), eq(schema.agentLessons.userId, req.user.id)));
      res.json({ success: true });
   } catch {
      res.status(500).json({ error: "Delete failed" });
   }
});

// Promote a [KNOWLEDGE GAP] lesson into the agent's knowledge base.
router.post("/api/knowledge-gaps/:lessonId/promote", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customContent } = req.body;
    const [lesson] = await drizzle
      .select({ id: schema.agentLessons.id, agentId: schema.agentLessons.agentId, lesson: schema.agentLessons.lesson, userId: schema.agentLessons.userId })
      .from(schema.agentLessons)
      .where(and(eq(schema.agentLessons.id, BigInt(req.params.lessonId)), eq(schema.agentLessons.userId, req.user.id)))
      .limit(1);
    if (!lesson) return res.status(404).json({ error: "Lesson not found." });

    const content =
      customContent?.trim() ||
      lesson.lesson.replace(/^\[KNOWLEDGE GAP\]\s*/, "").trim();

    if (!content) return res.status(400).json({ error: "Content is empty." });
    // Match the limit enforced by POST/PATCH /api/knowledge so promoted entries
    // can't exceed what a normal knowledge insert would allow.
    if (content.length > 2000) {
      return res.status(400).json({ error: "Content must be 2000 characters or less." });
    }

    await drizzle.insert(schema.knowledge).values({
      agentId: lesson.agentId,
      userId: req.user.id,
      content,
    });
    await drizzle.delete(schema.agentLessons).where(eq(schema.agentLessons.id, BigInt(lesson.id)));
    res.json({ success: true });
  } catch (e) { claudeErr(res, e); }
});

// Agent Forge — create the actual agent + seed personality, directives, knowledge.
router.post("/api/claude/forge/create", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { design, websiteUrl } = req.body;
    if (!design || !design.name) return res.status(400).json({ error: "design with name required." });

    const agentId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await drizzle.insert(schema.agents).values({
        id: agentId,
        userId: req.user.id,
        name: design.name,
        archetype: design.archetype || "Receptionist",
        firstMessage: design.first_message || `Hi, this is ${design.name}. How can I help?`,
        websiteUrl: websiteUrl || null,
        channel: "voice",
      });
    } catch (e: any) {
      throw e;
    }

    if (design.personality_block) {
      await drizzle.insert(schema.personality).values({
        agentId: agentId,
        userId: req.user.id,
        content: design.personality_block,
      }).onConflictDoUpdate({
        target: schema.personality.agentId,
        set: { content: design.personality_block }
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

export default router;
