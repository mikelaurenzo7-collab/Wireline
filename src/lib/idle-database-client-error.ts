import { log } from "./server-logger";

type ErrorEmitter = { on(event: "error", listener: (error: Error) => void): unknown };

/**
 * Keep a dropped idle database connection from taking the API down.
 *
 * node-postgres removes an idle pooled client that loses its socket and then
 * re-emits the failure as a Pool "error" event. An EventEmitter "error" with no
 * listener is an uncaught exception, and the fatal-process guard terminates the
 * process on those. In production a dropped idle connection ("read
 * ECONNABORTED") restarted the API four times in twelve minutes, cutting off
 * every request in flight. Nothing needs recovering here: the pool has already
 * discarded the client, the next checkout opens a fresh connection, and a
 * checked-out client still reports its failure through the active query.
 */
export function attachIdleDatabaseClientErrorListener(pool: ErrorEmitter): void {
  pool.on("error", (error) => {
    const code = (error as { code?: unknown }).code;
    log.warn("Discarded an idle database connection after a network error", {
      code: typeof code === "string" ? code : undefined,
      error: error.message,
    });
  });
}

/**
 * Keep a connection that drops while checked out from taking the process down.
 *
 * pg-pool listens for a client's "error" only while the client is idle. A
 * checked-out client that loses its socket fails its active query and then
 * emits "error" with nothing listening, which is an uncaught exception. Tenant
 * checkouts add their own listener, but root work did not, and the job worker
 * and voice call admission hold root transactions open across provider calls.
 * Every client therefore keeps a listener for its whole life. When the failed
 * client is released, pg-pool sees it is no longer queryable and discards it.
 */
export function attachCheckedOutDatabaseClientErrorListener(pool: {
  on(event: "connect", listener: (client: ErrorEmitter) => void): unknown;
}): void {
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      const code = (error as { code?: unknown }).code;
      log.warn("A database connection failed while in use", {
        code: typeof code === "string" ? code : undefined,
        error: error.message,
      });
    });
  });
}
