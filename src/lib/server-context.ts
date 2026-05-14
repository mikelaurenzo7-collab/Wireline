import { eq } from "drizzle-orm";
import { sql } from "@vercel/postgres";
import { drizzle as drizzleDb } from "drizzle-orm/vercel-postgres";
import * as schema from "../db/schema";
import { AuditLogger } from "./audit-logger";
import { createRbacMiddleware } from "../middleware/require-role";
import { QuotaTracker, type PlanTier } from "./tenant-quotas";

export const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

// ────────────────────────────────────────────────────────────────────
//  Required-secret helper
// ────────────────────────────────────────────────────────────────────
// Reads a secret env var. In production: throws at module load if missing
// (the app refuses to boot). In development: returns the optional
// devFallback if provided, otherwise throws. This is the single source of
// truth for "must have" secrets across the codebase — eliminates the
// scattered `process.env.X || "placeholder"` patterns that silently ship
// insecure defaults into prod.
export function requireSecret(name: string, devFallback?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (IS_PROD) {
    throw new Error(`[startup] Required secret ${name} is not set. Refusing to boot.`);
  }
  if (devFallback !== undefined) {
    // eslint-disable-next-line no-console
    console.warn(`[dev] ${name} not set — using insecure dev fallback.`);
    return devFallback;
  }
  throw new Error(`[startup] Required secret ${name} is not set.`);
}

// ────────────────────────────────────────────────────────────────────
//  Structured logger
// ────────────────────────────────────────────────────────────────────
type LogLevel = "debug" | "info" | "warn" | "error";
function emitLog(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(fields || {}) };
  if (IS_PROD) {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      JSON.stringify(entry),
    );
  } else {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      `[${level}]`,
      msg,
      fields ?? "",
    );
  }
}
export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emitLog("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emitLog("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emitLog("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emitLog("error", msg, fields),
};

// ────────────────────────────────────────────────────────────────────
//  fetchWithTimeout
// ────────────────────────────────────────────────────────────────────
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────
//  Database Initialization (Drizzle ORM)
// ────────────────────────────────────────────────────────────────────

// Fail fast at module load if POSTGRES_URL is missing in prod. Without
// this, `@vercel/postgres` would silently produce a client that 503s on
// the first query — health checks pass, then real traffic explodes.
requireSecret("POSTGRES_URL", "postgres://placeholder:placeholder@localhost:5432/placeholder");

export const db = drizzleDb(sql, { schema });
export const drizzle = db;

// ────────────────────────────────────────────────────────────────────
//  Audit Logger & RBAC Middleware
// ────────────────────────────────────────────────────────────────────
export const auditLogger = new AuditLogger(drizzle);
export const { requirePermission, requireRole } = createRbacMiddleware({ drizzle, auditLogger });

// ────────────────────────────────────────────────────────────────────
//  Quota Tracker
// ────────────────────────────────────────────────────────────────────
export const quotaTracker = new QuotaTracker({
  drizzle,
  getPlanForUser: async (userId: string): Promise<PlanTier> => {
    try {
      const [data] = await drizzle
        .select({ status: schema.settings.subscriptionStatus })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
        .limit(1);

      const status = data?.status ?? "free";
      if (status === "enterprise") return "enterprise";
      if (status === "pro") return "pro";
      if (status === "starter" || status === "active") return "starter";
      return "free";
    } catch {
      return "starter"; // Fail-open on DB errors.
    }
  },
});
