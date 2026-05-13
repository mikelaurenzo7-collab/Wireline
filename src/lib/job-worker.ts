import { db, log, quotaTracker, auditLogger } from "./server-context";
import * as claudeBrain from "./claude-brain";
import * as geminiBrain from "./gemini-brain";
import { getErrorMessage } from "./server-utils";
import { startWorker, type JobRow, enqueue } from "./job-queue";
import { executeAction } from "./action-engine";
import { ActionItemSchema } from "./action-types";
import { persistClaudeAuditRecords } from "../middleware/audit-middleware";
import { buildCallCompletedOutcome, dispatchWebhook } from "./webhook-helpers";
import { CRMService } from "./crm-service";
import { enrichLead as apolloEnrich, searchLeads as apolloSearch } from "./apollo-service";
import { purgeAccount } from "./account-deletion";

type SupportedCrmType = "salesforce" | "hubspot";

function truncateForCrm(text: string | undefined, max = 1_500): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function buildCrmCallDescription(input: {
  agentName?: string;
  direction: "inbound" | "outbound";
  customerNumber?: string | null;
  durationSeconds?: number;
  summary?: string;
  leadScore?: number;
  intentLabel?: string;
  sentiment?: string;
}): string {
  const lines = [
    input.agentName ? `Agent: ${input.agentName}` : null,
    `Direction: ${input.direction}`,
    input.customerNumber ? `Customer number: ${input.customerNumber}` : null,
    typeof input.durationSeconds === "number" ? `Duration: ${input.durationSeconds}s` : null,
    input.intentLabel ? `Intent: ${input.intentLabel}` : null,
    input.sentiment ? `Sentiment: ${input.sentiment}` : null,
    typeof input.leadScore === "number" ? `Lead score: ${input.leadScore}` : null,
    input.summary ? `Summary: ${truncateForCrm(input.summary)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

async function syncCallActivityToCrm(input: {
  userId: string;
  crmType?: string | null;
  agentName?: string;
  callId: string;
  direction: "inbound" | "outbound";
  customerNumber?: string | null;
  durationSeconds?: number;
  summary?: string;
  leadScore?: number;
  intentLabel?: string;
  sentiment?: string;
}) {
  if (!input.crmType || (input.crmType !== "salesforce" && input.crmType !== "hubspot")) return;
  if (!input.customerNumber) return;

  const crm = new CRMService(input.userId);
  const subjectSuffix = input.intentLabel ? ` - ${truncateForCrm(input.intentLabel, 80)}` : "";
  const activityId = await crm.logCall({
    crmType: input.crmType as SupportedCrmType,
    subject: `Wireline ${input.direction} call${subjectSuffix}`,
    description: buildCrmCallDescription(input),
    to_number: input.customerNumber,
    duration_minutes: input.durationSeconds ? Math.max(1, Math.round(input.durationSeconds / 60)) : 0,
    outcome: input.intentLabel || "completed",
  });

  if (activityId) {
    log.info("Post-call CRM sync succeeded", {
      userId: input.userId,
      crmType: input.crmType,
      callId: input.callId,
      activityId,
    });
    return;
  }

  log.warn("Post-call CRM sync skipped or failed", {
    userId: input.userId,
    crmType: input.crmType,
    callId: input.callId,
  });
}

/**
 * Global job handler.
 * Dispatches jobs from the wireline_jobs table.
 */
export async function handleJob(job: JobRow): Promise<void> {
  if (job.type === 'post_call_enrichment') {
    const p = job.payload as {
      agentId: string; userId: string; callId: string;
      agentName?: string; archetype?: string; role?: string;
      customerNumber?: string; durationSeconds?: number;
      summary?: string; transcript?: string;
      useFlash?: boolean;
    };
    
    // Check user tier for model selection
    const { data: settings } = await db.from('wireline_settings').select('ai_tier, crm_type').eq('user_id', p.userId).single();
    const useFlash = p.useFlash || settings?.ai_tier === 'starter';

    let result;
    let records: any[] = [];

    if (useFlash) {
      log.info("Using Gemini Flash for post-call enrichment", { userId: p.userId, callId: p.callId });
      result = await geminiBrain.postCallAnalysis({
        transcript: p.transcript!,
        summary: p.summary || ''
      });
    } else {
      if (!claudeBrain.isClaudeAvailable() || !p.transcript) return;
      const capture = await claudeBrain.withAuditCapture(() =>
        claudeBrain.postCallAnalysis({
          agentName:       p.agentName || 'Wireline Agent',
          archetype:       p.archetype || 'Receptionist',
          role:            p.role,
          customerNumber:  p.customerNumber,
          durationSeconds: p.durationSeconds ?? 0,
          summary:         p.summary || '',
          transcript:      p.transcript!,
        }),
      );
      result = capture.result;
      records = capture.records;
    }

    await db.from('wireline_call_logs').update({
      lead_score:    result.lead_score,
      intent_label:  result.intent_label,
      sentiment:     result.sentiment,
      coaching_note: result.coaching_note,
    }).eq('vapi_call_id', p.callId);
    
    if (result.lesson?.trim()) {
      await db.from('wireline_agent_lessons').upsert(
        { agent_id: p.agentId, user_id: p.userId, lesson: result.lesson.trim() },
        { onConflict: 'agent_id,lesson', ignoreDuplicates: true },
      );
    }
    
    if (useFlash) {
      const tokenCount = Math.ceil(((p.transcript?.length ?? 0) + (p.summary?.length ?? 0)) / 4);
      await quotaTracker.checkAndIncrement(p.userId, 'claude_tokens_daily', Math.max(1, tokenCount)).catch((e: unknown) => {
        log.warn("quota token increment failed — usage may be under-counted", { user_id: p.userId, error: getErrorMessage(e) });
      });
    } else if (records.length) {
      await persistClaudeAuditRecords({
        userId: p.userId,
        action: "jobs.post_call_enrichment",
        records,
        requestMeta: { vapi_call_id: p.callId, agent_id: p.agentId },
      }).catch((e: unknown) => log.warn("post_call audit persist failed", { error: getErrorMessage(e) }));
    } else {
      const tokenCount = Math.ceil(((p.transcript?.length ?? 0) + (p.summary?.length ?? 0)) / 4);
      await quotaTracker.checkAndIncrement(p.userId, 'claude_tokens_daily', Math.max(1, tokenCount)).catch((e: unknown) => {
        log.warn("quota token increment failed — usage may be under-counted", { user_id: p.userId, error: getErrorMessage(e) });
      });
    }

    const { data: logRow } = await db
      .from("wireline_call_logs")
      .select("direction, customer_number")
      .eq("vapi_call_id", p.callId)
      .maybeSingle();
    const direction = logRow?.direction === "outbound" ? "outbound" as const : "inbound" as const;
    const enrichment = {
      lead_score: result.lead_score,
      intent_label: result.intent_label,
      sentiment: result.sentiment,
      coaching_note: result.coaching_note,
      lesson_extracted: !!(result.lesson && result.lesson.trim()),
    };
    const payload = buildCallCompletedOutcome({
      vapi_call_id: p.callId,
      agent_id: p.agentId,
      customer_number: logRow?.customer_number || p.customerNumber || null,
      direction,
      duration_seconds: p.durationSeconds,
      enrichment_source: "async_post_call_job",
      enrichment,
    });
    await syncCallActivityToCrm({
      userId: p.userId,
      crmType: settings?.crm_type,
      agentName: p.agentName,
      callId: p.callId,
      direction,
      customerNumber: payload.customer_number,
      durationSeconds: p.durationSeconds,
      summary: p.summary,
      leadScore: result.lead_score,
      intentLabel: result.intent_label,
      sentiment: result.sentiment,
    }).catch((e: unknown) => log.warn("post_call CRM sync failed", {
      userId: p.userId,
      callId: p.callId,
      error: getErrorMessage(e),
    }));
    void dispatchWebhook(p.userId, "call.completed", payload);
    if (typeof result.lead_score === "number" && result.lead_score >= 70) {
      void dispatchWebhook(p.userId, "lead.hot", {
        vapi_call_id: p.callId,
        lead_score: result.lead_score,
        customer_number: payload.customer_number,
      });
    }
    const intent = (result.intent_label || "").toLowerCase();
    if (intent === "escalation" || intent === "escalate") {
      void dispatchWebhook(p.userId, "call.escalated", {
        vapi_call_id: p.callId,
        intent_label: result.intent_label,
        customer_number: payload.customer_number,
      });
    }

    // Automatically enqueue action extraction after enrichment
    await enqueue(db, {
      userId: p.userId,
      type: 'v2a_action_extraction',
      payload: { 
        userId: p.userId, 
        callId: p.callId,
        summary: p.summary,
        transcript: p.transcript,
        customerNumber: p.customerNumber
      }
    }).catch(e => log.error("Failed to enqueue V2A extraction", { error: getErrorMessage(e) }));
  }

  if (job.type === 'v2a_action_extraction') {
    const p = job.payload as { 
      userId: string; 
      callId: string; 
      transcript: string; 
      summary: string;
      customerNumber?: string;
    };
    
    const actions = await claudeBrain.extractActions({
      transcript: p.transcript,
      summary: p.summary,
      customerNumber: p.customerNumber
    });

    for (const action of actions) {
      await enqueue(db, {
        userId: p.userId,
        type: 'execute_action',
        payload: {
          userId: p.userId,
          action,
          context: { sourceId: p.callId, sourceType: 'phone_call' }
        }
      });
    }
    log.info("V2A extraction complete", { userId: p.userId, callId: p.callId, actionsCount: actions.length });
  }

  if (job.type === 'execute_action') {
    const p = job.payload as {
      userId: string;
      action: any;
      context: { sourceId: string; sourceType: string };
    };

    const parsed = ActionItemSchema.safeParse(p.action);
    if (!parsed.success) {
      log.error("Invalid action payload", { userId: p.userId, error: parsed.error });
      return;
    }

    await executeAction(p.userId, parsed.data, p.context);
  }

  if (job.type === 'adaptive_optimization') {
    const p = job.payload as {
      agentId: string;
      userId: string;
      callId: string;
      score: number;
      breakdown: any;
    };

    const { data: call } = await db.from('wireline_call_logs').select('transcript').eq('id', p.callId).single();
    if (!call?.transcript) return;

    const lesson = await claudeBrain.synthesizeLesson({
      transcript: call.transcript,
      score: p.score,
      breakdown: p.breakdown
    });

    if (lesson) {
      await db.from('wireline_agent_lessons').upsert(
        { agent_id: p.agentId, user_id: p.userId, lesson: lesson },
        { onConflict: 'agent_id,lesson', ignoreDuplicates: true },
      );
      log.info("Adaptive optimization: new lesson synthesized", { agentId: p.agentId, lesson });
    }
  }

  if (job.type === 'purge_old_data') {
    const p = job.payload as { user_id: string; retention_days?: number };
    if (!p.user_id) {
      log.warn('purge_old_data job missing user_id', { jobId: job.id });
      return;
    }
    const retentionDays = typeof p.retention_days === 'number' ? p.retention_days : 365;
    const { data, error } = await db.rpc('wireline_purge_old_data', {
      p_user_id: p.user_id,
      p_retention_days: retentionDays,
    });
    if (error) {
      log.error('purge_old_data job failed', { jobId: job.id, user_id: p.user_id, error: error.message });
      throw new Error(error.message);
    }
    log.info('purge_old_data job completed', { jobId: job.id, user_id: p.user_id, retention_days: retentionDays, result: data });
  }

  if (job.type === 'purge_deleted_account') {
    const p = job.payload as { user_id: string; queue_id?: string };
    if (!p.user_id) {
      log.warn('purge_deleted_account job missing user_id', { jobId: job.id });
      return;
    }

    // Guard: the queue row must still be 'pending' AND past its
    // scheduled_purge_at. If the user cancelled in the grace window, skip.
    let queueRow: { id: string; status: string; scheduled_purge_at: string; ip: string | null } | null = null;
    if (p.queue_id) {
      const { data } = await db
        .from('wireline_deletion_queue')
        .select('id, status, scheduled_purge_at, ip')
        .eq('id', p.queue_id)
        .maybeSingle();
      queueRow = (data as any) ?? null;
    } else {
      const { data } = await db
        .from('wireline_deletion_queue')
        .select('id, status, scheduled_purge_at, ip')
        .eq('user_id', p.user_id)
        .eq('status', 'pending')
        .maybeSingle();
      queueRow = (data as any) ?? null;
    }

    if (!queueRow || queueRow.status !== 'pending') {
      log.info('purge_deleted_account skipped — no pending queue row', { jobId: job.id, user_id: p.user_id });
      return;
    }
    if (new Date(queueRow.scheduled_purge_at).getTime() > Date.now()) {
      log.info('purge_deleted_account skipped — still within grace window', {
        jobId: job.id,
        user_id: p.user_id,
        scheduled_purge_at: queueRow.scheduled_purge_at,
      });
      return;
    }

    const result = await purgeAccount(p.user_id, { db, log });
    if (!result.ok) {
      log.error('purge_deleted_account failed', { jobId: job.id, user_id: p.user_id, error: result.error });
      throw new Error(result.error ?? 'account purge failed');
    }

    // Audit BEFORE marking the queue row purged so the audit row is still
    // owned by a (now-deleted) user — historical record of the action.
    void auditLogger
      .logAccountDeletion({ userId: p.user_id, tablesTouched: result.tablesTouched, ip: queueRow.ip ?? undefined })
      .catch(() => {});

    // Mark the queue row purged. The FK ON DELETE CASCADE from auth.users
    // would have already removed it when the auth row was deleted, so this
    // update may affect zero rows — that's fine.
    await db
      .from('wireline_deletion_queue')
      .update({ status: 'purged', purged_at: new Date().toISOString() })
      .eq('id', queueRow.id);

    log.info('purge_deleted_account completed', {
      jobId: job.id,
      user_id: p.user_id,
      tables_touched: result.tablesTouched.length,
    });
  }

  if (job.type === 'proactive_lead_enrichment') {
    const p = job.payload as { userId: string; customerNumber: string };
    
    log.info("Starting proactive lead enrichment", { userId: p.userId, customerNumber: p.customerNumber });

    try {
      const enrichment = await apolloEnrich(p.customerNumber);
      if (enrichment) {
        await db.from('wireline_lead_dossiers').upsert({
          user_id: p.userId,
          customer_number: p.customerNumber,
          full_name: enrichment.first_name && enrichment.last_name ? `${enrichment.first_name} ${enrichment.last_name}` : undefined,
          job_title: enrichment.title,
          company: enrichment.company,
          linked_in_url: enrichment.linkedin_url,
          dossier_data: enrichment
        }, { onConflict: 'user_id,customer_number' });
        
        log.info("Lead enrichment successful", { userId: p.userId, customerNumber: p.customerNumber, company: enrichment.company });
      } else {
        log.info("No enrichment data found for lead", { customerNumber: p.customerNumber });
      }
    } catch (error) {
      log.error("Proactive lead enrichment failed", { error: getErrorMessage(error) });
    }
  }

  if (job.type === 'autonomous_prospecting') {
    const p = job.payload as { userId: string };
    const { data: settings } = await db.from('wireline_settings').select('*').eq('user_id', p.userId).single();
    
    if (!settings?.prospecting_enabled) {
      log.info("Prospecting disabled for user", { userId: p.userId });
      return;
    }

    log.info("Starting autonomous prospecting", { userId: p.userId, titles: settings.target_titles });

    try {
      const leads = await apolloSearch({
        titles: settings.target_titles,
        industries: settings.target_industries,
        states: settings.target_states,
        employee_ranges: settings.target_employee_ranges,
        limit: 10
      });

      let added = 0;
      for (const lead of leads) {
        const { error } = await db.from('wireline_outbound_leads').insert({
          user_id: p.userId,
          customer_name: `${lead.first_name} ${lead.last_name}`,
          customer_number: lead.phone,
          email: lead.email,
          status: 'New',
          context: `Autonomously sourced via Apollo Intelligence for ${lead.title} role at ${lead.company}.`
        });
        if (!error) added++;
      }

      log.info("Autonomous prospecting complete", { userId: p.userId, leadsFound: leads.length, leadsAdded: added });
    } catch (error) {
      log.error("Autonomous prospecting failed", { error: getErrorMessage(error) });
    }
  }
}

/**
 * Initializes the background job worker.
 * Returns a stop function.
 */
export function initJobWorker() {
  if (process.env.VERCEL === '1') return null;

  return startWorker(db, handleJob, {
    pollIntervalMs: 10_000,
    onError: (err) => log.error('job worker error', { error: err.message }),
  });
}
