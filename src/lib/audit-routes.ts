// src/lib/audit-routes.ts
//
// Extracted Express handlers for the /api/audit/* endpoints. Living
// in their own module so we can unit-test them against an in-memory
// Supabase mock without dragging in the entire 11k-line server.ts.
//
// The handlers expect `req.user.id` to already be populated by the
// authenticateUser middleware that's applied at registration time in
// server.ts. The shape of `db` matches the @supabase/supabase-js
// client (only the chain methods we actually call are exercised, so
// tests can hand-roll a tiny stub).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditLogger } from './audit-logger';

export interface AuditRoutesLogger {
  error: (msg: string, ctx?: Record<string, any>) => void;
}

export interface AuditRoutesDeps {
  db: SupabaseClient;
  auditLogger: Pick<AuditLogger, 'logDataOperation'>;
  log: AuditRoutesLogger;
}

export interface AuditFilterInput {
  event_type?: unknown;
  severity?: unknown;
  resource_type?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  search?: unknown;
  days?: number;
}

// Allow-list pattern for event_type values: lowercase alnum, dot,
// underscore, hyphen. Anything else is dropped before we feed it to the
// PostgREST `or` filter syntax — otherwise a malicious category name
// could inject extra clauses (e.g. `,user_id.neq.<uuid>`).
const EVENT_TYPE_TOKEN = /^[a-z0-9_.-]+$/i;

/**
 * Apply the standard audit filter set to a PostgREST query builder.
 *
 * `event_type` accepts either a fully-qualified type (`agent.created`)
 * or a category prefix (`agent`, `auth`, `security`, …). Anything
 * without a dot is treated as a prefix and matched with
 * `event_type ilike 'prefix.%'` so the UI's category chips actually
 * filter. Mixed inputs (some prefixes, some concrete) are supported in
 * a single `or` clause.
 */
export function applyAuditFilters(query: any, filters: AuditFilterInput): any {
  const { event_type, severity, resource_type, start_date, end_date, search, days } = filters;

  if (event_type !== undefined && event_type !== null && event_type !== '') {
    const raw = Array.isArray(event_type) ? event_type : [event_type];
    const types: string[] = [];
    const prefixes: string[] = [];
    for (const v of raw) {
      const s = String(v).trim();
      if (!s || !EVENT_TYPE_TOKEN.test(s)) continue;
      if (s.includes('.')) types.push(s);
      else prefixes.push(s);
    }
    if (types.length && prefixes.length) {
      const clauses = [
        ...types.map((t) => `event_type.eq.${t}`),
        ...prefixes.map((p) => `event_type.ilike.${p}.%`),
      ];
      query = query.or(clauses.join(','));
    } else if (types.length) {
      query = query.in('event_type', types);
    } else if (prefixes.length) {
      const clauses = prefixes.map((p) => `event_type.ilike.${p}.%`);
      query = query.or(clauses.join(','));
    }
  }

  if (severity !== undefined && severity !== null && severity !== '') {
    const severities = Array.isArray(severity) ? severity : [severity];
    const clean = severities
      .map((s) => String(s).trim())
      .filter((s) => /^[a-z]+$/i.test(s));
    if (clean.length) query = query.in('severity', clean);
  }

  if (resource_type) {
    query = query.eq('resource_type', String(resource_type));
  }

  if (start_date) {
    query = query.gte('created_at', String(start_date));
  } else if (days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    query = query.gte('created_at', since.toISOString());
  }
  if (end_date) {
    query = query.lte('created_at', String(end_date));
  }

  if (search) {
    // Escape LIKE metacharacters so an `_` or `%` in the search term
    // doesn't expand to unbounded wildcards. Order matters: escape the
    // backslash itself FIRST, otherwise the replacement we add for `%`
    // and `_` would be re-doubled by a second pass. Also strip the few
    // characters PostgREST's `or` syntax treats specially.
    const sanitized = String(search)
      .replace(/\\/g, '\\\\')
      .replace(/[%_]/g, '\\$&')
      .replace(/[,()]/g, '');
    query = query.or(
      `action.ilike.%${sanitized}%,actor_email.ilike.%${sanitized}%,resource_id.ilike.%${sanitized}%`,
    );
  }

  return query;
}

function parseDays(daysParam: unknown, fallback: number): number {
  const n = parseInt(String(daysParam ?? fallback), 10);
  if (isNaN(n)) return NaN;
  return Math.min(Math.max(n, 1), 365);
}

export function createAuditEventsHandler(deps: AuditRoutesDeps) {
  const { db, log } = deps;
  return async function auditEventsHandler(req: any, res: any) {
    const userId = req.user.id;
    const {
      event_type,
      severity,
      resource_type,
      start_date,
      end_date,
      search,
      days: daysParam = '7',
      limit: limitParam = '100',
      offset: offsetParam = '0',
    } = req.query;

    const days = parseDays(daysParam, 7);
    const limitRaw = parseInt(String(limitParam), 10);
    const offsetRaw = parseInt(String(offsetParam), 10);
    if (isNaN(days) || isNaN(limitRaw) || isNaN(offsetRaw)) {
      return res.status(400).json({ error: 'Invalid numeric parameters' });
    }
    const limit = Math.min(Math.max(limitRaw, 1), 500);
    const offset = Math.max(offsetRaw, 0);

    try {
      let query = db
        .from('wireline_audit_log')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      query = applyAuditFilters(query, {
        event_type,
        severity,
        resource_type,
        start_date,
        end_date,
        search,
        days,
      });

      const { data, error, count } = await query;
      if (error) throw error;

      res.json({
        events: data || [],
        total: count || 0,
        limit,
        offset,
      });
    } catch (e: any) {
      log.error('Audit events error', {
        userId,
        error: String(e),
        query: req.query,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
      res.status(500).json({ error: 'Failed to fetch audit events' });
    }
  };
}

export function createAuditStatsHandler(deps: AuditRoutesDeps) {
  const { db, log } = deps;
  return async function auditStatsHandler(req: any, res: any) {
    const userId = req.user.id;
    const { days: daysParam = '30' } = req.query;
    const days = parseDays(daysParam, 30);
    if (isNaN(days)) {
      return res.status(400).json({ error: 'Invalid numeric parameters' });
    }

    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await db
        .from('wireline_audit_log')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', since.toISOString());
      if (error) throw error;

      const events = data || [];
      const bySeverity: Record<string, number> = {};
      const byType: Record<string, number> = {};
      let totalCost = 0;
      let apiCalls = 0;

      events.forEach((event: any) => {
        const sev = event.severity || 'info';
        bySeverity[sev] = (bySeverity[sev] || 0) + 1;

        const type = event.event_type || event.action || 'unknown';
        byType[type] = (byType[type] || 0) + 1;

        if (event.cost_usd) {
          const parsed = parseFloat(String(event.cost_usd));
          if (!isNaN(parsed)) totalCost += parsed;
        }

        // Count API / AI usage. We treat anything in the `ai.*`
        // namespace (legacy `ai.api_call` rows from the AI-spend
        // pipeline) OR the newer `api.*` namespace
        // (`api.webhook_sent`, `api.intake_received`, …) as API/AI
        // usage so the dashboard tile matches the actual cost figure.
        if (typeof type === 'string' && (type.startsWith('api.') || type.startsWith('ai.'))) {
          apiCalls++;
        }
      });

      res.json({
        total_events: events.length,
        by_severity: bySeverity,
        by_type: byType,
        total_cost_usd: totalCost,
        total_api_calls: apiCalls,
        period_days: days,
      });
    } catch (e: any) {
      log.error('Audit stats error', {
        userId,
        error: String(e),
        query: req.query,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
      res.status(500).json({ error: 'Failed to fetch audit statistics' });
    }
  };
}

function sanitizeCSV(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Prevent CSV formula injection — prefix dangerous leading
  // characters with a single quote so spreadsheets render them as text.
  if (str.match(/^[=@+-]/)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function createAuditExportHandler(deps: AuditRoutesDeps) {
  const { db, auditLogger, log } = deps;
  return async function auditExportHandler(req: any, res: any) {
    const userId = req.user.id;
    const {
      format = 'csv',
      event_type,
      severity,
      resource_type,
      start_date,
      end_date,
      search,
      days: daysParam = '30',
    } = req.query;

    const days = parseDays(daysParam, 30);
    if (isNaN(days)) {
      return res.status(400).json({ error: 'Invalid numeric parameters' });
    }

    try {
      let query = db
        .from('wireline_audit_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      query = applyAuditFilters(query, {
        event_type,
        severity,
        resource_type,
        start_date,
        end_date,
        search,
        days,
      });

      const { data, error } = await query;
      if (error) throw error;

      // Audit the export itself — non-blocking.
      void auditLogger
        .logDataOperation('export', {
          userId,
          resourceType: 'audit_log',
          recordCount: data?.length || 0,
          ip: req.ip,
        })
        .catch(() => {/* logger already records its own failures */});

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="audit-log-${Date.now()}.json"`,
        );
        res.json(data);
        return;
      }

      const events = data || [];
      const headers = [
        'created_at', 'event_type', 'severity', 'action',
        'actor_email', 'resource_type', 'resource_id',
        'ip_address', 'cost_usd', 'latency_ms',
      ];
      const csvRows = [headers.join(',')];
      for (const event of events) {
        csvRows.push(headers.map((h) => sanitizeCSV((event as any)[h])).join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit-log-${Date.now()}.csv"`,
      );
      res.send(csvRows.join('\n'));
    } catch (e: any) {
      log.error('Audit export error', {
        userId,
        error: String(e),
        query: req.query,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
      res.status(500).json({ error: 'Failed to export audit log' });
    }
  };
}
