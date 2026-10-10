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
