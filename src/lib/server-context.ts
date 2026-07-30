import { log, IS_PROD } from "./server-logger";
import { tryResolveDatabaseConnection } from "./database-connection";
import { AppError } from "./api-error";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
 * and COMMIT on release. Because pgbouncer pins one backend for the lifetime of an
 * open transaction, the GUC is visible to every query drizzle runs on this client.
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
    // Explicitly override any session-level read-only state inherited from a
    // transaction-pool backend. Supavisor intentionally reuses backend
    // sessions, so a maintenance client that leaks
    // default_transaction_read_only=on can otherwise break unrelated writes.
    // Transaction-local READ WRITE is safe for pooled connections and still
    // fails closed when the database is genuinely a read-only replica.
    await client.query("SET TRANSACTION READ WRITE");
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
    // COMMIT/ROLLBACK must settle before the client returns to the pool
    // (_origRelease only runs after). SET LOCAL ROLE is transaction-scoped, so
    // the next checkout never inherits wireline_server from this one.
    _origQuery(err ? "ROLLBACK" : "COMMIT")
      .then(() => _origRelease(err))
      .catch(() => _origRelease(err || true));
  };
  return client;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- pg Pool.connect has overloaded callback/promise signatures */
(pool as any).connect = function tenantScopedConnect(callback?: any): any {
  const userId = tenantStore.getStore();
  if (!userId || !UUID_RE.test(userId)) {
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
    } catch {
      return "free";
    }
  },
});
