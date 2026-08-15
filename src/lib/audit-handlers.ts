/* eslint-disable @typescript-eslint/no-explicit-any -- audit metadata and aggregate stats are stored as Postgres jsonb. */
import type { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import * as schema from "../db/schema";
import { eq, and, or, ilike, gte, lte, desc, inArray, sql } from "drizzle-orm";
import type { AuditLogger } from "./audit-logger";
import { mapObjectToSnake } from "./server-utils";

export interface AuditRoutesLogger {
  error: (msg: string, ctx?: Record<string, any>) => void;
}

export interface AuditRoutesDeps {
  drizzle: VercelPgDatabase<typeof schema>;
  auditLogger: Pick<AuditLogger, "logDataOperation">;
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

const EVENT_TYPE_TOKEN = /^[a-z0-9_.-]+$/i;
const AUDIT_EXPORT_MAX_ROWS = 5_000;
const AUDIT_EXPORT_FORMATS = new Set(["csv", "json"]);

export function buildAuditFilters(userId: string, filters: AuditFilterInput) {
  const { event_type, severity, resource_type, start_date, end_date, search, days } = filters;
  const clauses: any[] = [eq(schema.auditLog.userId, userId)];

  if (event_type !== undefined && event_type !== null && event_type !== "") {
    const raw = Array.isArray(event_type) ? event_type : [event_type];
    const types: string[] = [];
    const prefixes: string[] = [];
    for (const v of raw) {
      const s = String(v).trim();
      if (!s || !EVENT_TYPE_TOKEN.test(s)) continue;
      if (s.includes(".")) types.push(s);
      else prefixes.push(s);
    }

    const typeClauses = [];
    if (types.length) typeClauses.push(inArray(schema.auditLog.eventType, types));
    if (prefixes.length) {
      prefixes.forEach((p) => typeClauses.push(ilike(schema.auditLog.eventType, `${p}.%`)));
    }
    if (typeClauses.length) clauses.push(or(...typeClauses));
  }

  if (severity !== undefined && severity !== null && severity !== "") {
    const severities = Array.isArray(severity) ? severity : [severity];
    const clean = severities.map((s) => String(s).trim()).filter((s) => /^[a-z]+$/i.test(s));
    if (clean.length) clauses.push(inArray(schema.auditLog.severity, clean));
  }

  if (resource_type) {
    clauses.push(eq(schema.auditLog.resourceType, String(resource_type)));
  }

  if (start_date) {
    clauses.push(gte(schema.auditLog.createdAt, new Date(String(start_date))));
  } else if (days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    clauses.push(gte(schema.auditLog.createdAt, since));
  }
  if (end_date) {
    clauses.push(lte(schema.auditLog.createdAt, new Date(String(end_date))));
  }

  if (search) {
    const sanitized = String(search).replace(/[%_]/g, "\\$&");
    clauses.push(
      or(
        ilike(schema.auditLog.action, `%${sanitized}%`),
        ilike(schema.auditLog.actorEmail, `%${sanitized}%`),
        ilike(schema.auditLog.resourceId, `%${sanitized}%`),
      ),
    );
  }

  return and(...clauses);
}

function parseDays(daysParam: unknown, fallback: number): number {
  const n = parseInt(String(daysParam ?? fallback), 10);
  if (isNaN(n)) return NaN;
  return Math.min(Math.max(n, 1), 365);
}

export function createAuditEventsHandler(deps: AuditRoutesDeps) {
  const { drizzle, log } = deps;
  return async function auditEventsHandler(req: any, res: any) {
    const userId = req.user.id;
    const {
      event_type,
      custom_fields: _custom_fields, // retained for compatibility with route schema signature
      severity,
      resource_type,
      start_date,
      end_date,
      search,
      days: daysParam = "7",
      limit: limitParam = "100",
      offset: offsetParam = "0",
    } = req.query;

    const days = parseDays(daysParam, 7);
    const limitRaw = parseInt(String(limitParam), 10);
    const offsetRaw = parseInt(String(offsetParam), 10);
    if (isNaN(days) || isNaN(limitRaw) || isNaN(offsetRaw)) {
      return res.status(400).json({ error: "Invalid numeric parameters" });
    }
    const limit = Math.min(Math.max(limitRaw, 1), 500);
    const offset = Math.max(offsetRaw, 0);

    try {
      const filters = buildAuditFilters(userId, {
        event_type,
        severity,
        resource_type,
        start_date,
        end_date,
        search,
        days,
      });

      const [countRes] = await drizzle
        .select({ count: sql`count(*)` })
        .from(schema.auditLog)
        .where(filters);

      const count = Number(countRes.count);

      const data = await drizzle
        .select()
        .from(schema.auditLog)
        .where(filters)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(limit)
        .offset(offset);

      // UI reads snake_case throughout; Drizzle returns camelCase. Normalize.
      res.json({
        events: mapObjectToSnake(data || []),
        total: count || 0,
        limit,
        offset,
      });
    } catch (e: any) {
      log.error("Audit events error", {
        userId,
        error: String(e),
        query: req.query,
        ip: req.ip,
        userAgent: req.headers?.["user-agent"],
      });
      res.status(500).json({ error: "Failed to fetch audit events" });
    }
  };
}

export function createAuditStatsHandler(deps: AuditRoutesDeps) {
  const { drizzle, log } = deps;
  return async function auditStatsHandler(req: any, res: any) {
    const userId = req.user.id;
    const { days: daysParam = "30" } = req.query;
    const days = parseDays(daysParam, 30);
    if (isNaN(days)) {
      return res.status(400).json({ error: "Invalid numeric parameters" });
    }

    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      // Aggregated in Postgres, not in Node.
      //
      // This used to `.select()` every column of every matching row — up to a
      // year of a tenant's audit ledger, one row per AI call, `metadata` jsonb
      // and all — and then count them in a forEach. The counters it produced
      // are a handful of integers; the cost of producing them was the whole
      // table in the function's memory. `idx_audit_log_user_created` already
      // covers exactly this (user_id, created_at) filter, so the grouped form
      // is one indexed pass returning a few rows.
      //
      // `nullif(…, '')` reproduces the JavaScript truthiness the old code
      // relied on: both columns are NOT NULL with defaults, so only an empty
      // string could fall through to the literal fallback.
      const scope = and(eq(schema.auditLog.userId, userId), gte(schema.auditLog.createdAt, since));
      const severityExpr = sql<string>`coalesce(nullif(${schema.auditLog.severity}, ''), 'info')`;
      const typeExpr = sql<string>`coalesce(nullif(${schema.auditLog.eventType}, ''), nullif(${schema.auditLog.action}, ''), 'unknown')`;

      const [severityRows, typeRows, [totals]] = await Promise.all([
        drizzle
          .select({ key: severityExpr, count: sql<string>`count(*)` })
          .from(schema.auditLog)
          .where(scope)
          .groupBy(severityExpr),
        drizzle
          .select({ key: typeExpr, count: sql<string>`count(*)` })
          .from(schema.auditLog)
          .where(scope)
          .groupBy(typeExpr),
        drizzle
          .select({
            total: sql<string>`count(*)`,
            cost: sql<string>`coalesce(sum(${schema.auditLog.costUsd}), 0)`,
            apiCalls: sql<string>`count(*) filter (where ${typeExpr} like 'api.%' or ${typeExpr} like 'ai.%')`,
          })
          .from(schema.auditLog)
          .where(scope),
      ]);

      const toCounts = (rows: Array<{ key: string; count: string }>) =>
        rows.reduce<Record<string, number>>((acc, row) => {
          acc[row.key] = Number(row.count);
          return acc;
        }, {});

      res.json({
        total_events: Number(totals?.total ?? 0),
        by_severity: toCounts(severityRows),
        by_type: toCounts(typeRows),
        total_cost_usd: Number(totals?.cost ?? 0),
        total_api_calls: Number(totals?.apiCalls ?? 0),
        period_days: days,
      });
    } catch (e: any) {
      log.error("Audit stats error", {
        userId,
        error: String(e),
        query: req.query,
        ip: req.ip,
        userAgent: req.headers?.["user-agent"],
      });
      res.status(500).json({ error: "Failed to fetch audit statistics" });
    }
  };
}

function sanitizeCSV(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.match(/^[=@+-]/)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function createAuditExportHandler(deps: AuditRoutesDeps) {
  const { drizzle, auditLogger, log } = deps;
  return async function auditExportHandler(req: any, res: any) {
    const userId = req.user.id;
    const {
      format = "csv",
      event_type,
      severity,
      resource_type,
      start_date,
      end_date,
      search,
      days: daysParam = "30",
    } = req.query;

    const days = parseDays(daysParam, 30);
    const exportFormat = String(format || "csv").toLowerCase();
    if (isNaN(days)) {
      return res.status(400).json({ error: "Invalid numeric parameters" });
    }
    if (!AUDIT_EXPORT_FORMATS.has(exportFormat)) {
      return res.status(400).json({ error: "Invalid export format" });
    }

    try {
      const filters = buildAuditFilters(userId, {
        event_type,
        severity,
        resource_type,
        start_date,
        end_date,
        search,
        days,
      });

      const data = await drizzle
        .select()
        .from(schema.auditLog)
        .where(filters)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(AUDIT_EXPORT_MAX_ROWS + 1);
      const events = data || [];
      const exceedsExportLimit = events.length > AUDIT_EXPORT_MAX_ROWS;

      void auditLogger
        .logDataOperation("export", {
          userId,
          resourceType: "audit_log",
          recordCount: Math.min(events.length, AUDIT_EXPORT_MAX_ROWS),
          ip: req.ip,
        })
        .catch(() => {});

      if (exceedsExportLimit) {
        return res.status(413).json({
          error: `Audit export exceeds ${AUDIT_EXPORT_MAX_ROWS.toLocaleString()} rows. Narrow your filters and try again.`,
        });
      }

      if (exportFormat === "json") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.json"`);
        res.json(mapObjectToSnake(events));
        return;
      }

      const headers = [
        "createdAt",
        "eventType",
        "severity",
        "action",
        "actorEmail",
        "resourceType",
        "resourceId",
        "ipAddress",
        "costUsd",
        "latencyMs",
      ];
      const csvRows = [headers.join(",")];
      for (const event of events) {
        csvRows.push(headers.map((h) => sanitizeCSV((event as any)[h])).join(","));
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.csv"`);
      res.send(csvRows.join("\n"));
    } catch (e: any) {
      log.error("Audit export error", {
        userId,
        error: String(e),
        query: req.query,
        ip: req.ip,
        userAgent: req.headers?.["user-agent"],
      });
      res.status(500).json({ error: "Failed to export audit log" });
    }
  };
}
