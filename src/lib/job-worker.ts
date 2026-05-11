import { db, log, quotaTracker } from "./server-context";
import * as claudeBrain from "./claude-brain";
import * as geminiBrain from "./gemini-brain";
import { getErrorMessage } from "./server-utils";
import { startWorker, type JobRow, enqueue } from "./job-queue";
import { executeAction } from "./action-engine";
import { ActionItemSchema } from "./action-types";

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
    const { data: settings } = await db.from('wireline_settings').select('ai_tier').eq('user_id', p.userId).single();
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
    
    // Use actual token counts from the Anthropic response when available;
    // fall back to the character-based estimate only if the capture is empty.
    const actualTokens = records.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0);
    const tokenCount = actualTokens > 0
      ? actualTokens
      : Math.ceil(((p.transcript?.length ?? 0) + (p.summary?.length ?? 0)) / 4);
      
    await quotaTracker.checkAndIncrement(p.userId, 'claude_tokens_daily', tokenCount).catch((e: unknown) => {
      log.warn("quota token increment failed — usage may be under-counted", { user_id: p.userId, error: getErrorMessage(e) });
    });

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
