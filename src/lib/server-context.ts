export { log, IS_PROD } from "./server-logger";

import pkg from "pg";
const { Pool } = pkg;
import { eq } from "drizzle-orm";
import { drizzle as drizzleDb } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { AuditLogger } from "./audit-logger";
import { createRbacMiddleware } from "../middleware/require-role";
import { QuotaTracker, type PlanTier } from "./tenant-quotas";

// ─────────────────────────────────────────────────────────────────
//  fetchWithTimeout
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
//  Database Initialization (Drizzle ORM)
// ─────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: Math.min(20, Math.max(2, Number(process.env.POSTGRES_POOL_MAX || 8) || 8)),
  connectionTimeoutMillis: 12_000,
  idleTimeoutMillis: 20_000,
});

export const db = drizzleDb(pool, { schema });
export const drizzle = db;

// ─────────────────────────────────────────────────────────────────
//  AuditLogger & RBAC Middleware
// ─────────────────────────────────────────────────────────────────

export const auditLogger = new AuditLogger(drizzle);
export const { requirePermission, requireRole } = createRbacMiddleware({ drizzle, auditLogger });

// ─────────────────────────────────────────────────────────────────
//  Quota Tracker
// ─────────────────────────────────────────────────────────────────

export const quotaTracker = new QuotaTracker({
  drizzle,
  getPlanForUser: async (userId: string): Promise<PlanTier> => {
    try {
      const rows = await drizzle
        .select({ status: schema.settings.subscriptionStatus })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
        .limit(1);
      const data = rows[0];

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
