import { Router } from "express";

import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, sanitizeForAudit } from "../lib/server-utils";
import { parseFormData, AgentFormSchema, AgentBusinessProfileSchema } from "../lib/form-validators";
import { ROLE_PERSONALITY_TEMPLATES, DEFAULT_AGENT_ROLE } from "../lib/agent-constants";
import * as claudeBrain from "../lib/claude-brain";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { computeAgentPerformance, emptyAgentPerformance } from "../lib/agent-performance";
import { computeScorecard } from "../lib/agent-scorecard";
import { SentryEvents } from "../lib/sentry-events";
import { normalizeEnabledTools } from "../lib/agent-capabilities";

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const isMissingRoleColumnError = (error: any) =>
  typeof error?.message === "string" &&
  error.message.includes("Could not find the 'role' column of 'wireline_agents'");


router.get("/api/agents", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: agents, error } = await db.from('wireline_agents').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(500);
    if (error) log.warn("Failed to fetch agents", { userId: req.user.id, error: getErrorMessage(error) });
    res.json({ agents: agents || [] });
  } catch (error) {
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

router.post("/api/agents/:id/apply-role", authenticateUser, async (req: any, res: any) => {
  try {
    const { role } = req.body;
    const template = ROLE_PERSONALITY_TEMPLATES[role as keyof typeof ROLE_PERSONALITY_TEMPLATES];
    if (!template) return res.status(400).json({ error: "Unknown role" });

    // SECURITY: verify the agent belongs to the caller before upserting.
    // We use the service-role client (bypasses RLS) so without this check
    // a user could overwrite another user's agent's personality by
    // guessing the agent_id (and the upsert's onConflict: 'agent_id'
    // would even reassign ownership via the user_id field).
    const { data: agent } = await db
      .from('wireline_agents')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    await db.from('wireline_personality')
      .upsert({ agent_id: req.params.id, user_id: req.user.id, content: template }, { onConflict: 'agent_id' });

    res.json({ success: true, content: template });
  } catch (error) {
    log.error("Failed to apply role template", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to apply role template" });
  }
});

router.get("/api/agents/:id/export", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    const [agentRes, personalityRes, directivesRes, knowledgeRes] = await Promise.all([
      db.from('wireline_agents').select('*').eq('id', agentId).eq('user_id', userId).single(),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).single(),
      db.from('wireline_directives').select('content, priority').eq('agent_id', agentId).eq('user_id', userId).limit(500),
      db.from('wireline_knowledge').select('content').eq('agent_id', agentId).eq('user_id', userId).limit(500),
    ]);

    if (!agentRes.data) return res.status(404).json({ error: 'Agent not found' });

    const exportData = {
      wireline_export_version: 1,
      exported_at: new Date().toISOString(),
      agent: {
        name: agentRes.data.name,
        channel: agentRes.data.channel,
        role: agentRes.data.role,
        enabled_tools: agentRes.data.enabled_tools ?? null,
        personality: personalityRes.data?.content ?? '',
        directives: (directivesRes.data ?? []).map((d: any) => ({ content: d.content, priority: d.priority })),
        knowledge: (knowledgeRes.data ?? []).map((k: any) => k.content),
      },
    };

    const safeName = agentRes.data.name
      .replace(/[^\w\s-]/g, '')   // strip non-word chars (quotes, newlines, path chars)
      .replace(/\s+/g, '_')
      .slice(0, 64)
      || 'agent';
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_config.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

router.post("/api/agents/:id/import", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;
    const payload = req.body;

    // Validate structure
    if (!payload?.wireline_export_version || !payload?.agent) {
      return res.status(400).json({ error: 'Invalid export file format' });
    }

    // SECURITY: verify the target agent belongs to the caller. Without
    // this, the personality upsert (onConflict: 'agent_id') would let
    // any authenticated user overwrite another user's agent.
    const { data: ownedAgent } = await db
      .from('wireline_agents')
      .select('id')
      .eq('id', agentId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!ownedAgent) return res.status(404).json({ error: 'Agent not found' });

    const { personality, directives, knowledge, role, channel, enabled_tools } = payload.agent;

    // Replace personality
    if (personality) {
      await db.from('wireline_personality').upsert(
        { agent_id: agentId, user_id: userId, content: personality },
        { onConflict: 'agent_id' }
      );
    }

    // Merge directives (append new ones)
    if (Array.isArray(directives) && directives.length > 0) {
      await db.from('wireline_directives').insert(
        directives.map((d: any) => ({ agent_id: agentId, user_id: userId, content: d.content, priority: d.priority ?? 5 }))
      );
    }

    // Merge knowledge (append new ones)
    if (Array.isArray(knowledge) && knowledge.length > 0) {
      await db.from('wireline_knowledge').insert(
        knowledge.map((k: string) => ({ agent_id: agentId, user_id: userId, content: k }))
      );
    }

    const toolConfig = enabled_tools === null ? null : normalizeEnabledTools(enabled_tools);
    const importedAgentPatch: Record<string, unknown> = {};
    if (typeof role === 'string') importedAgentPatch.role = role;
    if (typeof channel === 'string') importedAgentPatch.channel = channel;
    if (enabled_tools !== undefined) importedAgentPatch.enabled_tools = toolConfig;
    if (Object.keys(importedAgentPatch).length > 0) {
      await db.from('wireline_agents')
        .update(importedAgentPatch)
        .eq('id', agentId)
        .eq('user_id', userId);
    }

    const imported = {
      personality: !!personality,
      directives: directives?.length ?? 0,
      knowledge: knowledge?.length ?? 0,
    };

    res.json({ success: true, imported });
  } catch (err) {
    res.status(500).json({ error: 'Import failed' });
  }
});

router.post("/api/agents", authenticateUser, async (req: any, res: any) => {
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
    const { data: userSettings } = await db.from('wireline_settings').select('subscription_status, max_agents').eq('user_id', req.user.id).single();

    // Gating mechanism: Prevent agent creation if the account is unpaid
    const subscriptionStatus = userSettings?.subscription_status || 'active';
    if (subscriptionStatus !== 'active') {
       return res.status(403).json({ error: "Access Denied: Please upgrade your billing plan." });
    }

    // Agent Limit Check
    const maxAgents = userSettings?.max_agents || 3;
    const { count: agentCount } = await db.from('wireline_agents').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);

    if (agentCount !== null && agentCount >= maxAgents) {
      return res.status(403).json({ error: `Quota Exceeded: Your plan only allows ${maxAgents} agents.` });
    }

    const { id, voice_id, channel } = req.body;
    if (!validation.data) throw new Error('Validation data missing after success check');
    const { name, role, personality } = validation.data;
    const agentRole = role || DEFAULT_AGENT_ROLE;
    const agentId = id || `agent-${Date.now()}`;
    let agentInsert = await db.from('wireline_agents').insert({
      id: agentId,
      user_id: req.user.id,
      name,
      voice_id: voice_id || 'bIHbv24MWmeRgasZH58o',
      channel: channel || 'voice',
      role: agentRole
    });
    let usedLegacyRoleFallback = false;

    if (agentInsert.error && isMissingRoleColumnError(agentInsert.error)) {
      usedLegacyRoleFallback = true;
      log.warn("wireline_agents.role missing; retrying legacy insert", { userId: req.user.id, agentId });
      agentInsert = await db.from('wireline_agents').insert({
        id: agentId,
        user_id: req.user.id,
        name,
        voice_id: voice_id || 'bIHbv24MWmeRgasZH58o',
        channel: channel || 'voice',
      });
    }

    if (agentInsert.error) {
      log.error("Agent row insert failed", {
        userId: req.user.id,
        agentId,
        error: getErrorMessage(agentInsert.error),
      });
      return res.status(500).json({ error: "Failed to create agent" });
    }

    // Use provided personality or fall back to role-appropriate template
    const personalityContent = personality
      || ROLE_PERSONALITY_TEMPLATES[agentRole as keyof typeof ROLE_PERSONALITY_TEMPLATES]
      || (channel === 'email'
        ? "You are a professional email agent specialized in clear, efficient communication."
        : "You are a helpful assistant serving as a phone agent.");

    const personalityInsert = await db.from('wireline_personality').insert({
       agent_id: agentId,
       user_id: req.user.id,
       content: personalityContent
    });

    if (personalityInsert.error) {
      log.error("Agent personality insert failed", {
        userId: req.user.id,
        agentId,
        error: getErrorMessage(personalityInsert.error),
      });
      await db.from('wireline_agents').delete().eq('id', agentId).eq('user_id', req.user.id);
      return res.status(500).json({ error: "Failed to create agent" });
    }
    
    // Audit log: agent creation
    void auditLogger.logAgentOperation('created', {
      userId: req.user.id,
      agentId,
      agentName: name,
      metadata: { channel: channel || 'voice', archetype: agentRole },
      ip: req.ip
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    res.json({ success: true, id: agentId });
  } catch (error) {
    log.error("Agent creation failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to create agent" });
  }
});

router.put("/api/agents/:id", authenticateUser, async (req: any, res: any) => {
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
    const { voice_id, voice_id_inbound, voice_id_outbound, voice_provider, first_message, archetype, ambient_noise, website_url, transfer_phone, email_auto_respond, email_agent_tone, email_signature, channel } = req.body;

    // Build the update payload — start with core fields, then merge
    // any business-profile fields the caller actually sent (so a
    // partial PATCH-style update doesn't clobber existing hours / mode
    // / variables when the caller is only changing the agent's name).
    const update: Record<string, unknown> = {
      name,
      voice_id,
      voice_id_inbound,
      voice_id_outbound,
      voice_provider,
      first_message,
      archetype,
      ambient_noise,
      website_url,
      transfer_phone,
      email_auto_respond,
      email_agent_tone,
      email_signature,
      channel,
      role,
    };
    if (profileValidation.data) {
      for (const k of profileFields) {
        if ((profileValidation.data as any)[k] !== undefined) {
          (update as any)[k] = (profileValidation.data as any)[k];
        }
      }
    }
    if (enabledToolsRaw !== undefined) {
      update.enabled_tools = enabledTools;
    }
    // personality is not stored on the agent row — it lives in
    // wireline_personality. The caller passes it in for the AgentForm
    // contract, but we only care that it validated.
    void personality;

    await db.from('wireline_agents').update(update).eq('id', req.params.id).eq('user_id', req.user.id);

    // Audit log: agent update (sanitize sensitive fields)
    void auditLogger.logAgentOperation('updated', {
      userId: req.user.id,
      agentId: req.params.id,
      metadata: { changes: sanitizeForAudit(req.body) },
      ip: req.ip
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update agent", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update agent" });
  }
});

router.delete("/api/agents/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    // Confirm the agent belongs to this user before touching anything.
    const { data: agent, error: lookupErr } = await db
      .from("wireline_agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (lookupErr) throw lookupErr;
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    // Null-out agent_id on tables that would otherwise block the delete.
    const nullTables = [
      { table: "wireline_call_logs",      label: "call_logs" },
      { table: "wireline_appointments",   label: "appointments" },
      { table: "wireline_outbound_leads", label: "outbound_leads" },
      { table: "wireline_fleet_tasks",    label: "fleet_tasks" },
      { table: "wireline_phone_numbers",  label: "phone_numbers" },
      { table: "wireline_signal_presence",label: "signal_presence" },
    ] as const;

    const nullResults = await Promise.allSettled(
      nullTables.map(({ table }) =>
        db.from(table as any).update({ agent_id: null }).eq("agent_id", agentId).eq("user_id", userId)
      )
    );

    nullResults.forEach((r, i) => {
      if (r.status === "rejected" || (r.status === "fulfilled" && (r.value as any)?.error)) {
        const reason = r.status === "rejected" ? getErrorMessage(r.reason) : (r.value as any)?.error?.message;
        log.warn(`agent delete: failed to null agent_id on ${nullTables[i].label}`, { agentId, reason });
      }
    });

    // Delete the agent row — CASCADE handles directives, knowledge,
    // personality, and lessons automatically.
    const { error: deleteErr } = await db
      .from("wireline_agents")
      .delete()
      .eq("id", agentId)
      .eq("user_id", userId);

    if (deleteErr) throw deleteErr;

    log.info("agent deleted", { agentId, userId });
    
    // Audit log: agent deletion
    void auditLogger.logAgentOperation('deleted', {
      userId: req.user.id,
      agentId: agentId,
      ip: req.ip
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
    
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete agent", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete agent." });
  }
});

router.post("/api/agents/:id/optimize", authenticateUser, async (req: any, res: any) => {
   try {
      const { id } = req.params;
      const { data: logs } = await db.from('wireline_call_logs')
         .select('summary, transcript, lead_score, intent_label')
         .eq('agent_id', id).eq('user_id', req.user.id)
         .order('created_at', { ascending: false }).limit(10);

      if (!logs || logs.length === 0) {
         return res.json({ suggestions: [], reason: "Insufficient data: Need at least 1 completed mission log." });
      }

      // Claude path — uses the same agent-review tool as /api/claude/agent-review,
      // but flattens the response to {suggestions, analysis} for legacy callers.
      if (claudeBrain.isClaudeAvailable()) {
         try {
            const { data: agent } = await db.from('wireline_agents')
               .select('name, archetype, role').eq('id', id).eq('user_id', req.user.id).single();
            const review = await claudeBrain.agentReview({
               agentName: agent?.name || 'Wireline Agent',
               archetype: agent?.archetype || 'Receptionist',
               role: agent?.role || DEFAULT_AGENT_ROLE,
               callLogs: logs as any,
            });
            return res.json({
               suggestions: (review.suggested_directives || []).slice(0, 3).map((d: any) => d.directive),
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
   } catch (e) {
      res.status(500).json({ error: "Optimization protocol failed" });
   }
});

router.get("/api/agents/:id/performance", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const { data: logs } = await db
      .from('wireline_call_logs')
      .select('id, lead_score, duration_seconds, sentiment, created_at')
      .eq('agent_id', agentId)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(500);

    res.json(computeAgentPerformance({ rows: logs || [] }));
  } catch (e: any) {
    log.error("Agent performance error", { error: e?.message });
    res.json(emptyAgentPerformance());
  }
});

router.get("/api/agents/:id/scorecard", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    // Bound the window to a sensible range. Default 30; cap at 365 so a
    // single dashboard page can't trigger a year-over-year scan by accident.
    const daysRaw = parseInt(req.query.days as string);
    const days = Math.min(Math.max(Number.isFinite(daysRaw) ? daysRaw : 30, 1), 365);

    // Verify ownership AND read kpi_focus in one shot.
    const { data: agent } = await db
      .from('wireline_agents')
      .select('id, kpi_focus')
      .eq('id', agentId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const focus: string = agent.kpi_focus || 'general';

    const now = Date.now();
    const windowMs = days * 24 * 60 * 60 * 1000;
    const periodStart = new Date(now - windowMs).toISOString();
    const priorStart  = new Date(now - 2 * windowMs).toISOString();

    // Two periods: current and prior, of equal length, so we can show
    // a delta_pct without inventing a baseline.
    const [currentLogs, priorLogs, appts, openTasks] = await Promise.all([
      db.from('wireline_call_logs')
        .select('id, lead_score, duration_seconds, sentiment, intent_label, created_at, customer_number')
        .eq('agent_id', agentId).eq('user_id', userId)
        .gte('created_at', periodStart)
        .order('created_at', { ascending: false })
        .limit(2000),
      db.from('wireline_call_logs')
        .select('id, lead_score, duration_seconds, sentiment, intent_label, created_at')
        .eq('agent_id', agentId).eq('user_id', userId)
        .gte('created_at', priorStart).lt('created_at', periodStart)
        .limit(2000),
      // Booked appointments attributed to this agent in the current window
      // — used as the conversion numerator.
      db.from('wireline_appointments')
        .select('id, created_at')
        .eq('agent_id', agentId).eq('user_id', userId)
        .gte('created_at', periodStart)
        .limit(2000),
      // Open follow-up fleet tasks linked to calls in the current window
      // — proxy for "calls that needed a human after the agent". Used in
      // the resolution-rate computation.
      db.from('wireline_fleet_tasks')
        .select('id, source_id, source_type, created_at')
        .eq('agent_id', agentId).eq('user_id', userId)
        .gte('created_at', periodStart)
        .eq('source_type', 'phone_call')
        .limit(2000),
    ]);

    // Hand the rows to the pure scorecard math (src/lib/agent-scorecard.ts)
    // so the per-focus metric definitions are unit-tested in isolation.
    const result = computeScorecard({
      focus,
      windowDays: days,
      now,
      currentLogs: currentLogs.data || [],
      priorLogs:   priorLogs.data || [],
      appointments: appts.data || [],
      openFollowUps: openTasks.data || [],
    });

    res.json(result);
  } catch (e: any) {
    log.error("Agent scorecard error", { error: getErrorMessage(e) });
    res.status(500).json({ error: 'Failed to compute scorecard' });
  }
});

router.get("/api/agents/:id/lessons", authenticateUser, async (req: any, res: any) => {
   try {
      const { data: lessons, error } = await db.from('wireline_agent_lessons').select('*')
         .eq('agent_id', req.params.id)
         .eq('user_id', req.user.id)
         .order('created_at', { ascending: false })
         .limit(200);
      if (error) throw error;
      res.json({ lessons });
   } catch (e) {
      res.status(500).json({ error: "Failed to fetch lessons" });
   }
});

router.post("/api/agents/:id/promote", authenticateUser, async (req: any, res: any) => {
   try {
      const { lessonId, content } = req.body;
      const agentId = req.params.id;

      // SECURITY: verify the caller owns the target agent before inserting
      // a directive against it. Without this, an attacker could promote a
      // lesson into another user's agent's directives.
      const { data: ownedAgent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agentId)
        .eq('user_id', req.user.id)
        .maybeSingle();
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
      const { error: promoError } = await db.from('wireline_directives').insert({
         agent_id: agentId,
         content: content.trim(),
         priority: 5,
         user_id: req.user.id
      });
      if (promoError) throw promoError;

      // Delete the lesson after promotion — verify ownership first
      await db.from('wireline_agent_lessons').delete()
         .eq('id', lessonId)
         .eq('user_id', req.user.id);

      // Track agent optimization when lessons are promoted to directives
      SentryEvents.agentOptimized({
        agent_id: agentId,
        metric_improved: 'instruction_baseline',
      });

      res.json({ success: true });
   } catch (e) {
      res.status(500).json({ error: "Promotion failed" });
   }
});

router.delete("/api/agents/:id/lessons/:lessonId", authenticateUser, async (req: any, res: any) => {
   try {
      await db.from('wireline_agent_lessons').delete()
         .eq('id', req.params.lessonId)
         .eq('user_id', req.user.id);
      res.json({ success: true });
   } catch (e) {
      res.status(500).json({ error: "Delete failed" });
   }
});

export default router;
