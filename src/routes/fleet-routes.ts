import { Router } from "express";

import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { parseFormData, FleetTaskCreateSchema } from "../lib/form-validators";
import { compileActivityFeed } from "../lib/fleet-activity";
import { ROLE_PERSONALITY_TEMPLATES } from "../lib/agent-constants";
import { claudeErr } from "../lib/claude-response-helpers";

const router = Router();

const FLEET_TASK_STATUSES = ['pending', 'open', 'in_progress', 'completed', 'cancelled'] as const;
const FLEET_TASK_PRIORITIES = ['low', 'medium', 'high'] as const;


router.post("/api/fleet/seed", authenticateUser, async (req: any, res: any) => {
  const userId = req.user.id;
  const specializedAgents = [
    {
      id: `riley-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: "Riley",
      channel: "voice",
      role: "receptionist",
      archetype: "Receptionist",
      first_message:
        "Hi — this is Riley at Wireline. Thanks for reaching us today. What can I help you with?",
      personality: ROLE_PERSONALITY_TEMPLATES.receptionist,
    },
    {
      id: `billing-spec-${Date.now()}`,
      name: "Billing Specialist",
      channel: "voice",
      role: "collections",
      archetype: "The Collector",
      first_message: "Hello, this is the billing department. I'm calling regarding your recent account inquiry. How can I assist you with your statement today?",
      personality: ROLE_PERSONALITY_TEMPLATES.collections
    },
    {
      id: `prospector-${Date.now()}`,
      name: "Outbound Prospector",
      channel: "voice",
      role: "sales",
      archetype: "The Closer",
      first_message: "Hi there! I'm calling from the growth team. We saw you were interested in our services and I wanted to see if we could set up a quick strategy session?",
      personality: ROLE_PERSONALITY_TEMPLATES.sales
    },
    {
      id: `growth-email-${Date.now()}`,
      name: "Growth Coordinator",
      channel: "email",
      role: "marketing",
      archetype: "Receptionist",
      email_agent_tone: "Friendly",
      email_signature: "The Growth Team",
      personality: ROLE_PERSONALITY_TEMPLATES.marketing
    },
    {
      id: `tech-support-${Date.now()}`,
      name: "Tier 2 Technical Lead",
      channel: "voice",
      role: "technical_support",
      archetype: "Support Tech",
      first_message: "Wireline Technical Support, this is the Tier 2 lead speaking. I understand you're having a complex issue. Let's get this resolved. What symptoms are you seeing?",
      personality: ROLE_PERSONALITY_TEMPLATES.technical_support
    }
  ] as Array<{
    id: string; name: string; channel: string; role: string; archetype?: string;
    first_message?: string; email_agent_tone?: string; email_signature?: string;
    personality: string;
  }>;

  try {
    for (const agent of specializedAgents) {
      await db.from('wireline_agents').insert({
        id: agent.id,
        user_id: userId,
        name: agent.name,
        channel: agent.channel,
        role: agent.role,
        archetype: agent.archetype,
        first_message: agent.first_message,
        email_agent_tone: agent.email_agent_tone,
        email_signature: agent.email_signature
      });

      await db.from('wireline_personality').insert({
        agent_id: agent.id,
        user_id: userId,
        content: agent.personality
      });
      
      // Add a default directive for each
      await db.from('wireline_directives').insert({
        agent_id: agent.id,
        user_id: userId,
        content: "Always verify the customer's identity before discussing account details.",
        priority: 10
      });
    }
    res.json({ success: true, count: specializedAgents.length });
  } catch (error) {
    log.error("Fleet seeding failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to seed fleet" });
  }
});

router.get("/api/fleet/presence", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_signal_presence')
      .select('*')
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ signals: data || [] });
  } catch (error) {
    log.error("Presence fetch failed", { error: getErrorMessage(error) });
    res.json({ signals: [] });
  }
});

router.get("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    // Optional server-side filters — callers can pass ?status=pending&priority=high
    // to avoid fetching the full task history when only a subset is needed (e.g.
    // the DashboardHome high-priority widget).
    const VALID_STATUSES   = new Set(["pending", "in_progress", "completed", "cancelled"]);
    const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
    const statusFilter   = typeof req.query.status   === "string" && VALID_STATUSES.has(req.query.status)   ? req.query.status   : null;
    const priorityFilter = typeof req.query.priority === "string" && VALID_PRIORITIES.has(req.query.priority) ? req.query.priority : null;

    let query = db.from('wireline_fleet_tasks')
                  .select('*, wireline_agents(name)')
                  .eq('user_id', req.user.id);

    if (statusFilter)   query = query.eq('status',   statusFilter);
    if (priorityFilter) query = query.eq('priority', priorityFilter);

    // Hard cap on returned rows — protects against unfiltered loads
    // ballooning into multi-thousand-row responses on busy fleets.
    const { data, error } = await query.limit(1000);
    
    if (error) throw error;

    const sortedTasks = (data || []).sort((a: any, b: any) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const priorityWeight: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1 };
      const weightA = priorityWeight[a.priority?.toLowerCase()] || 0;
      const weightB = priorityWeight[b.priority?.toLowerCase()] || 0;
      if (weightA !== weightB) return weightB - weightA;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.json({ tasks: sortedTasks });
  } catch (error) {
    log.error("Fetch tasks failed", { error: getErrorMessage(error) });
    res.json({ tasks: [] });
  }
});

router.post("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const validation = parseFormData(FleetTaskCreateSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }
    const { description, task_type, priority, source_type, source_id, target_channel, customer_info, agent_id, due_date } = validation.data!;
    await db.from('wireline_fleet_tasks').insert({
       source_type, source_id, target_channel, customer_info, task_type, description, agent_id, status: 'pending', user_id: req.user.id, priority, due_date
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to create fleet task" });
  }
});

router.patch("/api/fleet/tasks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { status, priority, due_date, agent_id, resolution_notes } = req.body;
    const updateData: any = {};
    if (status !== undefined) {
      if (!FLEET_TASK_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${FLEET_TASK_STATUSES.join(', ')}` });
      }
      updateData.status = status;
    }
    if (priority !== undefined) {
      if (!FLEET_TASK_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `priority must be one of: ${FLEET_TASK_PRIORITIES.join(', ')}` });
      }
      updateData.priority = priority;
    }
    if (due_date !== undefined) updateData.due_date = due_date;
    if (agent_id !== undefined) updateData.agent_id = agent_id;
    if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;
    
    await db.from('wireline_fleet_tasks').update(updateData).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update fleet task" });
  }
});

router.get("/api/fleet/activity", authenticateUser, async (req: any, res: any) => {
   try {
      const [logs, tasks, lessons, emails] = await Promise.all([
          db.from('wireline_call_logs').select('id, customer_number, lead_score, intent_label, summary, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_fleet_tasks').select('id, description, status, priority, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_agent_lessons').select('id, lesson, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_email_threads').select('id, customer_email, lead_score, intent_label, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5)
      ]);

      // Surface backend failures explicitly instead of returning a
      // misleading 200 with an empty feed.
      const queryError = logs.error || tasks.error || lessons.error || emails.error;
      if (queryError) throw queryError;

      const activity = compileActivityFeed({
         logs:    logs.data    || [],
         tasks:   tasks.data   || [],
         lessons: lessons.data || [],
         emails:  emails.data  || [],
      });

      res.json({ activity });
   } catch(e: any) {
      log.error("Activity feed error", { error: e?.message || String(e) });
      res.status(500).json({ error: "Failed to fetch activity" });
   }
});

//  TRIAGE INBOX — "what needs my attention right now"
// ──────────────────────────────────────────────────────────

router.get("/api/triage", authenticateUser, async (req: any, res: any) => {
  try {
    const [{ data: hotLeads }, { data: complianceTasks }, { data: pendingTasks }, { data: knowledgeGaps }, { data: escalations }] = await Promise.all([
      // Calls with high lead score from the last 7 days that don't have a follow-up logged.
      db.from("wireline_call_logs")
        .select("id, agent_id, customer_number, lead_score, intent_label, summary, created_at")
        .eq("user_id", req.user.id)
        .gte("lead_score", 70)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("lead_score", { ascending: false })
        .limit(30),
      db.from("wireline_fleet_tasks")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("task_type", "compliance_review")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("wireline_fleet_tasks")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("status", "pending")
        .neq("task_type", "compliance_review")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("wireline_agent_lessons")
        .select("id, agent_id, lesson, created_at")
        .eq("user_id", req.user.id)
        .like("lesson", "[KNOWLEDGE GAP]%")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("wireline_call_logs")
        .select("id, agent_id, customer_number, lead_score, summary, created_at")
        .eq("user_id", req.user.id)
        .or("intent_label.eq.escalation")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    res.json({
      hot_leads: hotLeads || [],
      compliance: complianceTasks || [],
      pending_tasks: pendingTasks || [],
      knowledge_gaps: knowledgeGaps || [],
      escalations: escalations || [],
      counts: {
        hot_leads: hotLeads?.length || 0,
        compliance: complianceTasks?.length || 0,
        pending_tasks: pendingTasks?.length || 0,
        knowledge_gaps: knowledgeGaps?.length || 0,
        escalations: escalations?.length || 0,
      },
    });
  } catch (e) {
    log.error("Triage fetch failed", { error: e instanceof Error ? e.message : String(e) });
    claudeErr(res, e);
  }
});

export default router;
