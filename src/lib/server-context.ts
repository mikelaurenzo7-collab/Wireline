export { log, IS_PROD } from "./server-logger";

import { AsyncLocalStorage } from "node:async_hooks";
import pkg from "pg";
const { Pool } = pkg;
import { eq } from "drizzle-orm";
import { drizzle as drizzleDb } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { AuditLogger } from "./audit-logger";
import { createRbacMiddleware } from "../middleware/require-role";
import { QuotaTracker, type PlanTier } from "./tenant-quotas";
import { isUuid } from "./uuid";

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
  connectionString: process.env.DATABASE_POOL_URL || process.env.POSTGRES_URL,
  // Serverless: avoid eager min connections per instance (Supabase pooler ~100 cap).
  max: 5,
  min: 0,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});

export const tenantStore = new AsyncLocalStorage<string>();
const _origConnect = pool.connect.bind(pool);

// Savepoint used to remap drizzle's own top-level BEGIN/COMMIT/ROLLBACK so that
// `drizzle.transaction()` keeps working while we hold the outer real transaction.
const OUTER_SAVEPOINT = "__wireline_tenant_sp__";

/**
 * Acquire a pooled client already scoped to `userId`'s tenant for RLS.
 *
 * The scoping MUST survive transaction-mode poolers (e.g. Supabase/pgbouncer on
 * :6543), which reset session state (`DISCARD ALL`) between transactions. Setting
 * the role / `app.current_user_id` GUC as standalone autocommit statements is
 * therefore wiped before the next query runs, leaving RLS policies to cast an
 * empty GUC to uuid → `invalid input syntax for type uuid: ""` → HTTP 500.
 *
 * To make the context stick on both session- and transaction-mode connections we
 * open a single real transaction at checkout, set the role + GUC `LOCAL` to it,
 * and COMMIT on release. Because pgbouncer pins one backend for the lifetime of
 * an open transaction, the GUC is visible to every query drizzle runs on this client.
 *
 * drizzle borrows a fresh connection per query/transaction, so each checkout has
 * exactly one outer level. When a route uses `drizzle.transaction()`, drizzle emits
 * its own `begin`/`commit`/`rollback`; we remap those to a savepoint on the outer
 * transaction so nothing tries to open a (illegal) nested top-level transaction.
 */
async function scopeClientToTenant(userId: string) {
  const client = await _origConnect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE wireline_server");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
  } catch (e) {
    // Roll back any partial transaction and discard the (now poisoned) connection.
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection unusable; release with destroy below */
    }
    client.release(true);
    throw e;
  }

  // Remap drizzle's top-level transaction control to savepoints so the outer
  // transaction (and thus the tenant GUC) stays open for the whole checkout.
  const _origQuery = client.query.bind(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg query has many overloads
  (client as any).query = (config: any, values?: any, cb?: any) => {
    const text = typeof config === "string" ? config : config?.text;
    if (typeof text === "string") {
      const normalized = text.trim().toLowerCase();
      let remapped: string | null = null;
      if (/^begin(\s|$)/.test(normalized)) remapped = `SAVEPOINT ${OUTER_SAVEPOINT}`;
      else if (normalized === "commit") remapped = `RELEASE SAVEPOINT ${OUTER_SAVEPOINT}`;
      else if (normalized === "rollback") remapped = `ROLLBACK TO SAVEPOINT ${OUTER_SAVEPOINT}`;
      if (remapped) {
        if (typeof config === "string") return _origQuery(remapped, values, cb);
        return _origQuery({ ...config, text: remapped }, values, cb);
      }
    }
    return _origQuery(config, values, cb);
  };

  const _origRelease = client.release.bind(client);
  let released = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg release signature uses overloads
  client.release = (err?: any) => {
    if (released) return;
    released = true;
    // Restore the raw query fn before finalizing so our control statements run as-is.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restoring pg client.query
    (client as any).query = _origQuery;
    // COMMIT closes the outer transaction. If it was aborted by an earlier error,
    // Postgres turns COMMIT into a ROLLBACK, so this is safe in both cases.
    _origQuery(err ? "ROLLBACK" : "COMMIT")
      .then(() => _origRelease(err))
      .catch(() => _origRelease(err || true));
  };
  return client;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- pg Pool.connect has overloaded callback/promise signatures */
(pool as any).connect = function tenantScopedConnect(callback?: any): any {
  const userId = tenantStore.getStore();
  if (!isUuid(userId)) {
    return callback ? _origConnect(callback) : _origConnect();
  }
  if (callback) {
    scopeClientToTenant(userId)
      .then((client) => callback(null, client, client.release))
      .catch((err: any) => callback(err));
    return;
  }
  return scopeClientToTenant(userId);
};
/* eslint-enable @typescript-eslint/no-explicit-any */

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
        case "scale":
        case "custom":
          return "enterprise";
        case "business":
        case "starter":
        case "pro":
        case "business-growth":
          return "business";
        case "team":
        case "business-starter":
        case "business-lite":
        case "lite":
        case "personal-plus":
          return "team";
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
