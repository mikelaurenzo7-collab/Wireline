import { Router, Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { db, log, auditLogger } from '../lib/server-context';
import { authenticateUser } from '../middleware/auth';
import { getErrorMessage } from '../lib/server-utils';
import { enqueue } from '../lib/job-queue';
import { jobsRateLimit } from '../middleware/api-rate-limits';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  computeScheduledPurgeAt,
} from '../lib/account-deletion';

const router = Router();

router.get('/api/settings', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await db
      .from('wireline_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .single();
    if (error) throw error;
    res.json({ settings: data || {} });
  } catch {
    res.json({ settings: {} });
  }
});

router.post('/api/settings', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const update = { ...req.body };
    delete update.id;
    delete update.user_id;
    delete update.created_at;

    const { data, error } = await db
      .from('wireline_settings')
      .update(update)
      .eq('user_id', req.user.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ settings: data });
  } catch (error) {
    log.error('Failed to update settings', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/api/user-preferences', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await db
      .from('wireline_user_preferences')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    res.json({
      tour_completed: data?.tour_completed ?? false,
      onboarding_completed: data?.onboarding_completed ?? false,
      help_enabled: data?.help_enabled ?? true,
      keyboard_shortcuts_enabled: data?.keyboard_shortcuts_enabled ?? true,
      preferences: data?.preferences ?? {},
    });
  } catch (error) {
    log.error('Failed to fetch user preferences', { error });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.post('/api/user-preferences', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ALLOWED_FIELDS = [
      'persona',
      'tour_completed',
      'onboarding_completed',
      'help_enabled',
      'keyboard_shortcuts_enabled',
      'preferences',
    ] as const;
    const update: Record<string, unknown> = {};
    for (const f of ALLOWED_FIELDS) {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    }

    const { data, error } = await db
      .from('wireline_user_preferences')
      .upsert(
        { ...update, user_id: req.user.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .select()
      .single();
    if (error) throw error;
    res.json({ preferences: data });
  } catch (error) {
    log.error('Failed to update preferences', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.get('/api/onboarding/progress', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const [{ count: agentCount }, { count: callCount }, { data: settings }, { data: prefs }] =
      await Promise.all([
        db
          .from('wireline_agents')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        db
          .from('wireline_call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        db
          .from('wireline_settings')
          .select('subscription_status, vapi_private_key')
          .eq('user_id', userId)
          .maybeSingle(),
        db
          .from('wireline_user_preferences')
          .select('onboarding_completed')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

    res.json({
      has_agents: (agentCount || 0) > 0,
      has_calls: (callCount || 0) > 0,
      has_billing: settings?.subscription_status === 'active',
      has_voice: !!settings?.vapi_private_key,
      completed: !!prefs?.onboarding_completed,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GDPR / data-export: POST /api/account/export
// Exports all user-owned data from every wireline_* table as a JSON file.
// Returns a download URL or the JSON directly depending on implementation.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/account/export', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user.id;
  try {
    log.info('account export requested', { uid });

    // List of all tables to export (same order as delete for consistency)
    const tables = [
      'wireline_settings',
      'wireline_agents',
      'wireline_directives',
      'wireline_knowledge',
      'wireline_personality',
      'wireline_agent_lessons',
      'wireline_appointments',
      'wireline_call_logs',
      'wireline_email_accounts',
      'wireline_email_threads',
      'wireline_email_messages',
      'wireline_fleet_tasks',
      'wireline_phone_numbers',
      'wireline_outbound_leads',
      'wireline_outbound_campaigns',
      'wireline_signal_presence',
      'wireline_audit_log',
      'wireline_webhooks',
      'wireline_webhook_deliveries',
      'wireline_spend_budgets',
      'wireline_spend_alerts',
      'wireline_intake_keys',
      'wireline_subscriptions',
      'wireline_stripe_events',
      'wireline_dnc_list',
      'wireline_user_preferences',
      'wireline_onboarding_progress',
      'wireline_consent_log',
      'wireline_quota_limits',
      'wireline_quota_usage',
      'wireline_calendar_accounts',
      'wireline_calendar_events',
      'wireline_crm_connections',
      'wireline_team_members',
      'wireline_change_log',
      'wireline_incidents',
      'wireline_jobs',
    ];

    const exportData: Record<string, unknown[]> = {};
    let totalRows = 0;

    // Collect all user data from each table
    for (const table of tables) {
      // Some SOC2/Admin tables use tenant_id instead of user_id for account ownership
      const userCol = ['wireline_team_members', 'wireline_change_log', 'wireline_incidents'].includes(table)
        ? 'tenant_id'
        : 'user_id';

      const { data, error } = await db.from(table).select('*').eq(userCol, uid);

      if (error) {
        log.warn(`account export: ${table} query failed`, { error: error.message });
        exportData[table] = [];
      } else {
        exportData[table] = data || [];
        totalRows += (data || []).length;
      }
    }

    // Add metadata
    const exportPackage = {
      metadata: {
        user_id: uid,
        email: req.user.email || 'unknown',
        exported_at: new Date().toISOString(),
        total_rows: totalRows,
        wireline_version: '1.0.0',
      },
      tables: exportData,
    };

    log.info('account export completed', { uid, totalRows });

    // Return as JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="wireline-account-export-${uid.substring(0, 8)}-${Date.now()}.json"`,
    );
    res.status(200).json(exportPackage);
  } catch (err: any) {
    log.error('account export failed', { uid, error: getErrorMessage(err) });
    res.status(500).json({ error: 'Account export failed. Please contact support.' });
  }
});

// Data Retention: POST /api/account/purge-old-data
// Enqueues an on-demand data-retention purge job for the authenticated tenant.
// Useful for GDPR "right to erasure" requests where the user wants old data
// purged immediately rather than waiting for the nightly scheduler.
//
// The actual deletion runs asynchronously in the job worker via the Postgres
// function wireline_purge_old_data(). Minimum retention is 90 days.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/api/account/purge-old-data',
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user.id;
    try {
      const { data: settings } = await db
        .from('wireline_settings')
        .select('retention_days')
        .eq('user_id', uid)
        .maybeSingle();
      const retentionDays =
        typeof (settings as { retention_days?: number } | null)?.retention_days === 'number'
          ? (settings as { retention_days: number }).retention_days
          : 365;
      const result = await enqueue(db, {
        userId: uid,
        type: 'purge_old_data',
        payload: { user_id: uid, retention_days: retentionDays },
        maxAttempts: 3,
      });
      if (!result.ok) {
        log.error('Failed to enqueue purge_old_data job', { user_id: uid, error: result.error });
        return res.status(500).json({ error: 'Failed to schedule purge job' });
      }
      log.info('purge_old_data job enqueued on demand', {
        user_id: uid,
        retention_days: retentionDays,
        jobId: result.jobId,
      });
      res.json({ success: true, retention_days: retentionDays, job_id: result.jobId });
    } catch (err: any) {
      log.error('POST /api/account/purge-old-data failed', {
        error: getErrorMessage(err),
        user_id: uid,
      });
      res.status(500).json({ error: 'Failed to schedule purge job' });
    }
  },
);

// GDPR / data-deletion: DELETE /api/user/account
// Enqueues a soft-delete request. The actual hard-delete cascade runs in the
// background worker (`purge_deleted_account` job type) only after a 30-day
// grace period elapses, during which the user can call
// POST /api/account/cancel-deletion to revoke the request.
//
// Requires the authenticated user to confirm intent by passing
// { confirm: "DELETE MY ACCOUNT" } in the body.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/api/user/account', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';
  if (req.body?.confirm !== CONFIRMATION_PHRASE) {
    return res.status(400).json({
      error: `Send { "confirm": "${CONFIRMATION_PHRASE}" } to confirm deletion.`,
      grace_days: ACCOUNT_DELETION_GRACE_DAYS,
      info:
        `Account deletion is reversible for ${ACCOUNT_DELETION_GRACE_DAYS} days via POST /api/account/cancel-deletion.`,
    });
  }
  const uid = req.user.id;
  try {
    const requestedAt = new Date();
    const scheduledPurgeAt = computeScheduledPurgeAt(requestedAt);

    // Insert a pending row. The partial unique index
    // (idx_deletion_queue_one_pending_per_user) ensures we cannot create a
    // second pending request for the same user.
    const { data: existing } = await db
      .from('wireline_deletion_queue')
      .select('id, scheduled_purge_at, status')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .maybeSingle();

    let queueRow: { id: string; scheduled_purge_at: string };
    if (existing) {
      queueRow = existing as { id: string; scheduled_purge_at: string };
    } else {
      const { data: inserted, error: insertErr } = await db
        .from('wireline_deletion_queue')
        .insert({
          user_id: uid,
          requested_at: requestedAt.toISOString(),
          scheduled_purge_at: scheduledPurgeAt.toISOString(),
          status: 'pending',
          ip: req.ip ?? null,
          user_agent: req.headers?.['user-agent'] ?? null,
        })
        .select('id, scheduled_purge_at')
        .single();
      if (insertErr || !inserted) {
        log.error('account deletion: enqueue failed', { uid, error: insertErr?.message });
        return res.status(500).json({ error: 'Failed to schedule account deletion.' });
      }
      queueRow = inserted as { id: string; scheduled_purge_at: string };
    }

    void auditLogger
      .logAccountDeletionRequested({
        userId: uid,
        scheduledPurgeAt: queueRow.scheduled_purge_at,
        ip: req.ip,
      })
      .catch(() => {});

    return res.status(202).json({
      status: 'pending',
      scheduled_purge_at: queueRow.scheduled_purge_at,
      grace_days: ACCOUNT_DELETION_GRACE_DAYS,
      cancel_endpoint: '/api/account/cancel-deletion',
    });
  } catch (err: any) {
    log.error('account deletion enqueue failed', { uid, error: getErrorMessage(err) });
    res.status(500).json({ error: 'Failed to schedule account deletion.' });
  }
});

// GDPR / data-deletion: POST /api/account/cancel-deletion
// Cancels a pending deletion request, provided the grace window has not yet
// elapsed. Idempotent: if no pending row exists, returns 404.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/account/cancel-deletion', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user.id;
  try {
    const { data: existing } = await db
      .from('wireline_deletion_queue')
      .select('id, scheduled_purge_at, status')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({ error: 'No pending deletion request found.' });
    }

    const row = existing as { id: string; scheduled_purge_at: string; status: string };
    if (new Date(row.scheduled_purge_at).getTime() <= Date.now()) {
      return res.status(410).json({
        error: 'Grace period has expired. Deletion can no longer be cancelled.',
        scheduled_purge_at: row.scheduled_purge_at,
      });
    }

    const { error: updErr } = await db
      .from('wireline_deletion_queue')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updErr) {
      log.error('cancel-deletion: update failed', { uid, error: updErr.message });
      return res.status(500).json({ error: 'Failed to cancel deletion.' });
    }

    void auditLogger
      .logAccountDeletionCancelled({ userId: uid, ip: req.ip })
      .catch(() => {});

    return res.json({ status: 'cancelled' });
  } catch (err: any) {
    log.error('cancel-deletion failed', { uid, error: getErrorMessage(err) });
    res.status(500).json({ error: 'Failed to cancel deletion.' });
  }
});

export default router;
