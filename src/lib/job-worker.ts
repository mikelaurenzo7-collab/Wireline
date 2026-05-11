import { db, log, quotaTracker } from "./server-context";
import * as claudeBrain from "./claude-brain";
import { getErrorMessage } from "./server-utils";
import { startWorker, type JobRow } from "./job-queue";

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
    };
    if (!claudeBrain.isClaudeAvailable() || !p.transcript) return;
    // Wrap in withAuditCapture so we get the exact token counts from the
    // Anthropic API response instead of the rough transcript.length / 4
    // character estimate. Falls back to the estimate if the capture has no records.
    const { result, records } = await claudeBrain.withAuditCapture(() =>
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
