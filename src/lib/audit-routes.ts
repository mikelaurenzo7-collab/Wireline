import type { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import * as schema from "../db/schema";
import { eq, and, or, ilike, gte, lte, desc, inArray, sql } from "drizzle-orm";
import type { AuditLogger } from "./audit-logger";

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

      res.json({
        events: data || [],
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

      const events = await drizzle
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.userId, userId), gte(schema.auditLog.createdAt, since)));

      const bySeverity: Record<string, number> = {};
      const byType: Record<string, number> = {};
      let totalCost = 0;
      let apiCalls = 0;

      events.forEach((event: any) => {
        const sev = event.severity || "info";
        bySeverity[sev] = (bySeverity[sev] || 0) + 1;

        const type = event.eventType || event.action || "unknown";
        byType[type] = (byType[type] || 0) + 1;

        if (event.costUsd) {
          const parsed = parseFloat(String(event.costUsd));
          if (!isNaN(parsed)) totalCost += parsed;
        }

        if (typeof type === "string" && (type.startsWith("api.") || type.startsWith("ai."))) {
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
    if (isNaN(days)) {
      return res.status(400).json({ error: "Invalid numeric parameters" });
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
        .orderBy(desc(schema.auditLog.createdAt));

      void auditLogger
        .logDataOperation("export", {
          userId,
          resourceType: "audit_log",
          recordCount: data?.length || 0,
          ip: req.ip,
        })
        .catch(() => {});

      if (format === "json") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.json"`);
        res.json(data);
        return;
      }

      const events = data || [];
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
