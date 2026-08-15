import type { PoolClient } from "pg";

export type TenantTransactionOutcome = "commit" | "rollback";

type QueryCallback = (error?: Error, result?: unknown) => void;
type RawQuery = (...args: unknown[]) => unknown;

export interface TenantScopedClient {
  client: PoolClient;
  finalize(outcome: TenantTransactionOutcome): Promise<void>;
}

const OUTER_SAVEPOINT = "__wireline_tenant_sp__";

function errorForCallback(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function releaseError(error: unknown): Error | true {
  return error instanceof Error ? error : true;
}

function queryText(config: unknown): string | undefined {
  if (typeof config === "string") return config;
  if (!config || typeof config !== "object" || !("text" in config)) return undefined;
  return typeof config.text === "string" ? config.text : undefined;
}

function remapQuery(config: unknown, text: string): unknown {
  return typeof config === "string" ? text : { ...(config as object), text };
}

async function promiseQuery(
  rawQuery: RawQuery,
  config: unknown,
  values?: unknown,
): Promise<unknown> {
  return values === undefined ? rawQuery(config) : rawQuery(config, values);
}

function callbackFrom(valuesOrCallback: unknown, callback: unknown): QueryCallback | undefined {
  if (typeof valuesOrCallback === "function") return valuesOrCallback as QueryCallback;
  return typeof callback === "function" ? (callback as QueryCallback) : undefined;
}

function runWithOptionalCallback(
  work: () => Promise<unknown>,
  valuesOrCallback: unknown,
  callback: unknown,
): Promise<unknown> | void {
  const queryCallback = callbackFrom(valuesOrCallback, callback);
  if (!queryCallback) return work();

  void work().then(
    (result) => queryCallback(undefined, result),
    (error) => queryCallback(errorForCallback(error)),
  );
}

/**
 * Put one checked-out client inside the outer transaction that carries the
 * tenant-local role and user id through transaction-mode poolers.
 *
 * Drizzle opens its own transaction after checkout. Its top-level transaction
 * controls are therefore mapped to one savepoint. Crucially, the mapped COMMIT
 * and ROLLBACK do not resolve until the real outer transaction has also
 * finalized. That makes an outer COMMIT failure observable to Drizzle instead
 * of allowing the transaction promise to resolve early.
 */
export async function scopePgClientToTenant(
  client: PoolClient,
  userId: string,
): Promise<TenantScopedClient> {
  const rawQuery = client.query.bind(client) as RawQuery;
  const rawRelease = client.release.bind(client);
  // Pool.query normally installs this listener while a client is checked out.
  // Our tenant-aware Pool.query owns the checkout instead, so keep connection
  // errors from becoming uncaught events; the active query promise carries the
  // same error to the caller and the client is discarded during finalization.
  const checkedOutClientErrorListener = () => undefined;
  client.on("error", checkedOutClientErrorListener);

  try {
    await promiseQuery(rawQuery, "BEGIN");
    await promiseQuery(rawQuery, "SET TRANSACTION READ WRITE");
    await promiseQuery(rawQuery, "SET LOCAL ROLE wireline_server");
    await promiseQuery(rawQuery, "SELECT set_config('app.current_user_id', $1, true)", [userId]);
  } catch (error) {
    try {
      await promiseQuery(rawQuery, "ROLLBACK");
    } catch {
      // The failed checkout is discarded below, so socket close is the final
      // rollback backstop when PostgreSQL can no longer accept a query.
    }
    client.removeListener("error", checkedOutClientErrorListener);
    rawRelease(true);
    throw error;
  }

  let finalization: { outcome: TenantTransactionOutcome; promise: Promise<void> } | undefined;
  let failedCommitCleanup: Promise<void> | undefined;
  let released = false;

  const finalize = (outcome: TenantTransactionOutcome): Promise<void> => {
    if (!finalization) {
      const promise = promiseQuery(rawQuery, outcome === "commit" ? "COMMIT" : "ROLLBACK").then(
        () => undefined,
      );
      finalization = { outcome, promise };
      return promise;
    }

    if (finalization.outcome === outcome) return finalization.promise;

    // Drizzle catches a rejected mapped COMMIT and asks the same client to
    // ROLLBACK. Wait for the failed COMMIT, make one best-effort cleanup
    // rollback, and let Drizzle rethrow the original COMMIT error. The client
    // is still discarded by release(), even if this cleanup cannot be sent.
    if (outcome === "rollback" && finalization.outcome === "commit") {
      failedCommitCleanup ??= finalization.promise.then(
        () => undefined,
        async () => {
          try {
            await promiseQuery(rawQuery, "ROLLBACK");
          } catch {
            // Preserve the causative COMMIT error. release() destroys the
            // uncertain connection rather than returning it to the pool.
          }
        },
      );
      return failedCommitCleanup;
    }

    // A transaction that has rolled back cannot subsequently commit. Reusing
    // the settled rollback promise keeps release idempotent and fail-closed.
    return finalization.promise;
  };

  const mutableClient = client as unknown as {
    query: RawQuery;
    release(error?: Error | boolean): void;
  };

  mutableClient.query = (...args: unknown[]): unknown => {
    const [config, valuesOrCallback, callback] = args;
    const text = queryText(config);
    const normalized = text?.trim().toLowerCase();

    let remapped: string | undefined;
    let outcome: TenantTransactionOutcome | undefined;
    if (normalized && /^begin(\s|$)/.test(normalized)) {
      remapped = `SAVEPOINT ${OUTER_SAVEPOINT}`;
    } else if (normalized === "commit") {
      remapped = `RELEASE SAVEPOINT ${OUTER_SAVEPOINT}`;
      outcome = "commit";
    } else if (normalized === "rollback") {
      remapped = `ROLLBACK TO SAVEPOINT ${OUTER_SAVEPOINT}`;
      outcome = "rollback";
    }

    if (!remapped) return rawQuery(...args);

    const values = typeof valuesOrCallback === "function" ? undefined : valuesOrCallback;
    return runWithOptionalCallback(
      async () => {
        // A failed mapped COMMIT is followed by Drizzle's ROLLBACK. At that
        // point the outer finalization has already started, so skip the stale
        // savepoint command and perform the controller's cleanup path.
        if (finalization && outcome) {
          await finalize(outcome);
          return undefined;
        }

        let result: unknown;
        try {
          result = await promiseQuery(rawQuery, remapQuery(config, remapped), values);
        } catch (queryError) {
          try {
            await finalize("rollback");
          } catch (rollbackError) {
            throw new AggregateError(
              [queryError, rollbackError],
              "Tenant savepoint command failed and the outer transaction could not roll back.",
            );
          }
          throw queryError;
        }

        if (outcome) await finalize(outcome);
        return result;
      },
      valuesOrCallback,
      callback,
    );
  };

  mutableClient.release = (error?: Error | boolean): void => {
    if (released) return;
    released = true;

    const completion = finalize(error ? "rollback" : "commit");
    const restoreAndRelease = (releaseReason?: Error | boolean) => {
      client.removeListener("error", checkedOutClientErrorListener);
      mutableClient.query = rawQuery;
      mutableClient.release = rawRelease;
      rawRelease(releaseReason);
    };
    void completion.then(
      () => restoreAndRelease(error),
      (finalizationError) => restoreAndRelease(releaseError(finalizationError)),
    );
  };

  return { client, finalize };
}

async function executeTenantOneShotQuery(
  acquireClient: () => Promise<PoolClient>,
  userId: string,
  config: unknown,
  values?: unknown,
): Promise<unknown> {
  const scoped = await scopePgClientToTenant(await acquireClient(), userId);

  let result: unknown;
  try {
    result = await promiseQuery(
      scoped.client.query.bind(scoped.client) as RawQuery,
      config,
      values,
    );
  } catch (queryError) {
    try {
      await scoped.finalize("rollback");
    } catch (rollbackError) {
      const failure = new AggregateError(
        [queryError, rollbackError],
        "Database query failed and the tenant transaction could not roll back.",
      );
      scoped.client.release(releaseError(failure));
      throw failure;
    }
    scoped.client.release(releaseError(queryError));
    throw queryError;
  }

  try {
    await scoped.finalize("commit");
  } catch (commitError) {
    scoped.client.release(releaseError(commitError));
    throw commitError;
  }
  scoped.client.release();
  return result;
}

/**
 * Promise/callback-compatible equivalent of pg Pool.query for tenant work.
 * pg's built-in Pool.query invokes client.release() synchronously and resolves
 * its result immediately afterwards. Since release itself cannot be awaited,
 * the outer tenant COMMIT must be owned here before the caller is notified.
 */
export function runTenantScopedPoolQuery(
  acquireClient: () => Promise<PoolClient>,
  userId: string,
  config: unknown,
  valuesOrCallback?: unknown,
  callback?: unknown,
): Promise<unknown> | void {
  const values = typeof valuesOrCallback === "function" ? undefined : valuesOrCallback;
  return runWithOptionalCallback(
    () => executeTenantOneShotQuery(acquireClient, userId, config, values),
    valuesOrCallback,
    callback,
  );
}
