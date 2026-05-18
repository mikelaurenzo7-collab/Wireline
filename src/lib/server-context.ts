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
    // Plan lives in wireline_subscriptions.plan (set by syncSubscriptionFromStripe).
    // wireline_settings.subscriptionStatus only stores active/past_due/canceled —
    // it is NOT a plan name. Reading status here would collapse every tier
    // into "starter" (the prior bug). Join subscriptions for the plan id and
    // gate on a paying Stripe status before granting paid-tier quotas.
    try {
      const rows = await drizzle
        .select({
          plan: schema.subscriptions.plan,
          stripeStatus: schema.subscriptions.status,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId))
        .limit(1);
      const sub = rows[0];
      const stripeActive = sub?.stripeStatus === "active" || sub?.stripeStatus === "trialing";
      if (!stripeActive) return "free";

      switch (sub?.plan) {
        case "enterprise":
          return "enterprise";
        case "business":
          return "business";
        case "pro":
          return "pro";
        case "starter":
          return "starter";
        case "personal":
          return "personal";
        default:
          return "free";
      }
    } catch {
      return "free";
    }
  },
});
