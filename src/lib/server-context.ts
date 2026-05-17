export { log, IS_PROD } from "./server-logger";

import pkg from "pg";
const { Pool } = pkg;
import { eq } from "drizzle-orm";
import { drizzle as drizzleDb } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { AuditLogger } from "./audit-logger";
import { createRbacMiddleware } from "../middleware/require-role";
import { QuotaTracker, type PlanTier } from "./tenant-quotas";

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

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export const db = drizzleDb(pool, { schema });
export const drizzle = db;

export const auditLogger = new AuditLogger(drizzle);
export const { requirePermission, requireRole } = createRbacMiddleware({ drizzle, auditLogger });

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
      if (status === "business") return "business";
      if (status === "pro") return "pro";
      if (status === "starter" || status === "active") return "starter";
      if (status === "personal") return "personal";
      return "free";
    } catch {
      return "starter";
    }
  },
});
