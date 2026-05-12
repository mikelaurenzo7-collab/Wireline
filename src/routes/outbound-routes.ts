import { Router } from 'express';
import { db, log, quotaTracker } from '../lib/server-context';
import { authenticateUser } from '../middleware/auth';
import { getErrorMessage } from '../lib/server-utils';
import { parseFormData } from '../lib/form-validators';
import { OutboundBulkSchema } from '../lib/form-validators';
import { isDncBlocked } from '../lib/compliance';
import { evaluateOutboundConsent } from '../lib/tcpa-consent';
import { quotaRejectionHeaders } from '../lib/tenant-quotas';
import { placeOutboundCall } from '../lib/vapi-client';
import { SentryEvents } from '../lib/sentry-events';
import { claudeRateLimiter, dialRateLimiter } from '../middleware/api-rate-limits';

const router = Router();

router.get('/api/outbound', authenticateUser, async (req: any, res: any) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 100 : limitRaw), 500);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);
    const { data, count, error } = await db
      .from('wireline_outbound_leads')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({
      leads: data || [],
      total: count || 0,
      hasMore: count ? offset + limit < count : false,
    });
  } catch {
    res.json({ leads: [], total: 0, hasMore: false });
  }
});

// Returns upcoming scheduled callbacks for the operator dashboard.
// Sorted by soonest first, capped at 50 for display purposes.
// Rate-limited to 30 req/min per user to prevent scraping.
router.get('/api/callbacks', claudeRateLimiter, authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_outbound_leads')
      .select(
        'id, customer_name, customer_number, callback_scheduled_at, last_contact_summary, agent_id, attempts',
      )
      .eq('user_id', req.user.id)
      .eq('status', 'Callback-Scheduled')
      .not('callback_scheduled_at', 'is', null)
      .order('callback_scheduled_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    res.json({ callbacks: data || [] });
  } catch (e: any) {
    log.error('GET /api/callbacks failed', { error: e?.message });
    res.status(500).json({ error: 'Failed to load callbacks.' });
  }
});

router.delete('/api/outbound/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db
      .from('wireline_outbound_leads')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('Failed to delete lead', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Failed to delete lead.' });
  }
});

router.post('/api/outbound/dial', authenticateUser, dialRateLimiter, async (req: any, res: any) => {
  try {
    const { agentId, customerName, customerNumber, context } = req.body;
    if (!agentId || !customerNumber) {
      return res.status(400).json({ error: 'agentId and customerNumber are required.' });
    }

    // DNC compliance check — block calls to numbers on the Do Not Call list.
    if (await isDncBlocked(req.user.id, customerNumber)) {
      log.warn('Outbound dial blocked by DNC list', { customerNumber });
      return res
        .status(403)
        .json({
          error: 'This number is on the Do Not Call list and cannot be dialed.',
          dncBlocked: true,
        });
    }

    // TCPA pre-call consent gate.
    const tcpaDecision = evaluateOutboundConsent({
      phone: customerNumber,
      is_internal_dnc: false, // already checked above
      is_marketing_call: true,
      has_express_written_consent: false,
    });
    if (!tcpaDecision.allowed) {
      log.warn('Outbound dial blocked by TCPA consent gate', {
        customerNumber,
        abort_reason: tcpaDecision.abort_reason,
      });
      return res
        .status(403)
        .json({
          error: tcpaDecision.disclosure_script || 'Call blocked by TCPA consent rules.',
          tcpaBlocked: true,
          tcpa: tcpaDecision,
        });
    }

    // Per-tenant voice-minute quota check.
    const quotaDecision = await quotaTracker.checkAndIncrement(
      req.user.id,
      'voice_minutes_daily',
      0,
    );
    if (!quotaDecision.allowed) {
      Object.entries(quotaRejectionHeaders(quotaDecision)).forEach(([k, v]) => res.setHeader(k, v));
      return res
        .status(429)
        .json({
          error: 'Daily voice-minute quota exceeded.',
          code: 'QUOTA_VOICE',
          quota: quotaDecision,
        });
    }

    const result = await placeOutboundCall({
      userId: req.user.id,
      agentId,
      customerName,
      customerNumber,
      context,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    await db.from('wireline_outbound_leads').insert({
      user_id: req.user.id,
      agent_id: agentId,
      customer_name: customerName,
      customer_number: customerNumber,
      context: context,
      call_id: result.callId,
      status: 'Dialing',
    });

    SentryEvents.outboundDialStarted({
      lead_count: 1,
      agent_id: agentId,
    });

    res.json({ success: true, callId: result.callId });
  } catch (error: unknown) {
    log.error('Outbound call failed', { error: getErrorMessage(error) });
    // Don't leak the raw error message; log full server-side, return safe message to client.
    res.status(500).json({ error: 'Failed to dispatch call.' });
  }
});

router.post('/api/outbound/bulk', authenticateUser, async (req: any, res: any) => {
  try {
    const validation = parseFormData(OutboundBulkSchema, {
      leads: req.body.leads,
      campaign_id: req.body.campaign_id,
    });
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
    }
    const { leads, campaign_id } = validation.data!;

    // SECURITY ENFORCEMENT
    const { data: userSettings } = await db
      .from('wireline_settings')
      .select('subscription_status')
      .eq('user_id', req.user.id)
      .single();
    if (userSettings?.subscription_status !== 'active') {
      return res.status(403).json({ error: 'Access Denied: Inactive billing plan.' });
    }

    // Verify campaign_id (when supplied) belongs to the caller. Without
    // this an attacker could attribute their leads to another user's
    // campaign, polluting the campaign's analytics + lead pool.
    if (campaign_id) {
      const { data: ownedCampaign } = await db
        .from('wireline_outbound_campaigns')
        .select('id')
        .eq('id', campaign_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!ownedCampaign) return res.status(404).json({ error: 'Campaign not found' });
    }

    const leadsWithUser = (leads || []).map((lead: any) => ({
      ...lead,
      user_id: req.user.id,
      campaign_id: campaign_id || null,
    }));

    const { data, error } = await db
      .from('wireline_outbound_leads')
      .insert(leadsWithUser)
      .select('id');
    if (error) throw error;

    // Track bulk campaign start
    if (data?.length > 0) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('user_id', req.user.id)
        .limit(1)
        .single();
      SentryEvents.outboundDialStarted({
        lead_count: data.length,
        agent_id: agent?.id || 'unknown',
      });
    }

    res.json({ success: true, inserted: data.length });
  } catch {
    res.status(500).json({ error: 'Failed to queue leads' });
  }
});

export default router;
