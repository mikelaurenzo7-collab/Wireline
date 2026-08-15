import { log, IS_PROD } from "./server-logger";
import { tryResolveDatabaseConnection } from "./database-connection";
import { AppError } from "./api-error";
import { resolveTenantDatabaseScope } from "./tenant-context-scope";
import { runTenantScopedPoolQuery, scopePgClientToTenant } from "./tenant-pool-transaction";

export { log, IS_PROD };

import { AsyncLocalStorage } from "node:async_hooks";
import pkg from "pg";
const { Pool } = pkg;
import { eq } from "drizzle-orm";
import { drizzle as drizzleDb } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { AuditLogger } from "./audit-logger";
import { createRbacMiddleware } from "../middleware/require-role";
import { QuotaTracker, type PlanTier } from "./tenant-quotas";

/**
 * Vapi's create-call API does not expose an idempotency key. The outbound
 * client historically reused the same RequestInit object across automatic
 * network/5xx retries, which can dial twice when Vapi accepted the first POST
 * but the response was lost. A WeakSet gives every concrete create request one
 * transmission. A deliberate model-fallback request uses a distinct object and
 * remains allowed after a concrete validation response.
 */
const transmittedVapiCreateRequests = new WeakSet<object>();

function claimNonIdempotentRequest(url: string, init: RequestInit): void {
  if (!init || typeof init !== "object") return;
  const method = String(init.method || "GET").toUpperCase();
  if (method !== "POST") return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  const isVapiCreate =
    parsed.protocol === "https:" &&
    parsed.hostname === "api.vapi.ai" &&
    (parsed.pathname === "/call" || parsed.pathname === "/call/phone");
  if (!isVapiCreate) return;

  if (transmittedVapiCreateRequests.has(init)) {
    throw new Error(
      "Duplicate-safe boundary blocked an ambiguous retry of Vapi call creation. Verify call status before dialing again.",
    );
  }
  transmittedVapiCreateRequests.add(init);
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  claimNonIdempotentRequest(url, init);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const databaseConnection = tryResolveDatabaseConnection();
const isNoDatabaseImportSmoke = process.env.WIRELINE_IMPORT_SMOKE_NO_DATABASE === "true";
if (databaseConnection?.ignoredInvalidPoolUrl) {
  log.warn("Ignoring invalid DATABASE_POOL_URL; using validated POSTGRES_URL fallback", {
    selected: databaseConnection.source,
  });
}

const databaseUnavailable = () =>
  AppError.serviceUnavailable("Database is not configured for this deployment.");

function rejectDatabaseOperation(callback?: unknown): Promise<never> | void {
  const error = databaseUnavailable();
  if (typeof callback === "function") {
    queueMicrotask(() => callback(error));
    return;
  }
  return Promise.reject(error);
}

function createUnavailablePool(): InstanceType<typeof Pool> {
  return {
    connect(callback?: unknown) {
      return rejectDatabaseOperation(callback);
    },
    query(_config: unknown, values?: unknown, callback?: unknown) {
      return rejectDatabaseOperation(typeof values === "function" ? values : callback);
    },
  } as unknown as InstanceType<typeof Pool>;
}

if (!databaseConnection) {
  if (isNoDatabaseImportSmoke) {
    log.info("Database intentionally unavailable for no-database import smoke.");
  } else {
    log.warn("Database unavailable for this deployment; database-backed routes will return 503.");
  }
}

const pool = databaseConnection
  ? new Pool({
      connectionString: databaseConnection.connectionString,
      // Serverless: avoid eager min connections per instance (Supabase pooler ~100 cap).
      max: 5,
      min: 0,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    })
  : createUnavailablePool();

export const tenantStore = new AsyncLocalStorage<string>();

type AwaitedTuple<T extends readonly unknown[]> = {
  -readonly [K in keyof T]: Awaited<T[K]>;
};

/**
 * Resolve lazy Drizzle query builders one at a time on a transaction-bound
 * pg client. `Promise.all()` calls every thenable concurrently; pg@8 only
 * queues that unsupported pattern and pg@9 rejects it. Keeping the batch lazy
 * preserves one tenant-scoped snapshot without overlapping `client.query()`.
 */
export async function serialQueryBatch<const T extends readonly unknown[]>(
  queries: T,
): Promise<AwaitedTuple<T>> {
  const rows: unknown[] = [];
  for (const query of queries) rows.push(await query);
  return rows as unknown as AwaitedTuple<T>;
}

const _origConnect = pool.connect.bind(pool);

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
 * and finalize it before the caller observes success. Because pgbouncer pins one
 * backend for the lifetime of an open transaction, the GUC is visible to every
 * query drizzle runs on this client.
 *
 * drizzle borrows a fresh connection per query/transaction, so each checkout has
 * exactly one outer level. When a route uses `drizzle.transaction()`, drizzle emits
 * its own `begin`/`commit`/`rollback`; we remap those to a savepoint on the outer
 * transaction so nothing tries to open a (illegal) nested top-level transaction.
 */
async function scopeClientToTenant(userId: string) {
  const client = await _origConnect();
  return (await scopePgClientToTenant(client, userId)).client;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- pg Pool.connect has overloaded callback/promise signatures */
(pool as any).connect = function tenantScopedConnect(callback?: any): any {
  const userId = tenantStore.getStore();
  let connectionScope: ReturnType<typeof resolveTenantDatabaseScope>;
  try {
    connectionScope = resolveTenantDatabaseScope(userId);
  } catch (error) {
    log.error("Refusing database checkout for malformed tenant context", {
      hasTenantContext: Boolean(userId),
    });
    if (callback) {
      queueMicrotask(() => callback(error));
      return;
    }
    return Promise.reject(error);
  }

  if (connectionScope.kind === "root") {
    return callback ? _origConnect(callback) : _origConnect();
  }
  if (callback) {
    scopeClientToTenant(connectionScope.userId)
      .then((client) => callback(null, client, client.release))
      .catch((err: any) => callback(err));
    return;
  }
  return scopeClientToTenant(connectionScope.userId);
};

const _origPoolQuery = pool.query.bind(pool);
(pool as any).query = function tenantScopedQuery(config: any, values?: any, callback?: any): any {
  const userId = tenantStore.getStore();
  let connectionScope: ReturnType<typeof resolveTenantDatabaseScope>;
  try {
    connectionScope = resolveTenantDatabaseScope(userId);
  } catch (error) {
    log.error("Refusing database query for malformed tenant context", {
      hasTenantContext: Boolean(userId),
    });
    const queryCallback = typeof values === "function" ? values : callback;
    if (queryCallback) {
      queueMicrotask(() => queryCallback(error));
      return;
    }
    return Promise.reject(error);
  }

  if (connectionScope.kind === "root") {
    return _origPoolQuery(config, values, callback);
  }
  return runTenantScopedPoolQuery(_origConnect, connectionScope.userId, config, values, callback);
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const db = drizzleDb(pool, { schema });
/**
 * Application query surface. Hide the root-only `$client` implementation detail
 * so `typeof drizzle` remains structurally compatible with Drizzle transaction
 * executors. Code that genuinely needs the raw database instance can import `db`.
 */
export const drizzle: Omit<typeof db, "$client"> = db;

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
        case "pro":
        case "business-growth":
          return "business";
        case "team":
        case "shared":
          return "team";
        case "starter":
        case "business-starter":
        case "business-lite":
        case "lite":
        case "personal-plus":
          return "personal";
        case "personal":
          return "free";
        default:
          return "free";
      }
    } catch (err) {
      // Demoting to free-tier quotas is the safe direction for spend, but a
      // paying tenant silently hitting free limits mid-session is a real
      // incident — it must at least be visible in logs.
      log.error("plan lookup failed — falling back to free-tier quotas", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return "free";
    }
  },
});
