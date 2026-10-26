import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../src/lib/server-logger", () => ({ log: { warn: h.warn } }));

import {
  attachCheckedOutDatabaseClientErrorListener,
  attachIdleDatabaseClientErrorListener,
} from "../src/lib/idle-database-client-error";

/** Enough of pg.Client for pg-pool to connect, park as idle, and discard it. */
class SocketlessClient extends EventEmitter {
  _queryable = true;
  _ending = false;
  connect(callback: (error?: Error) => void) {
    queueMicrotask(() => callback());
  }
  isConnected() {
    return !this._ending;
  }
  unref() {}
  end(callback?: () => void) {
    this._ending = true;
    callback?.();
    return Promise.resolve();
  }
}

async function parkIdleClient(pool: pg.Pool): Promise<SocketlessClient> {
  const client = await pool.connect();
  client.release();
  expect(pool.idleCount).toBe(1);
  return client as unknown as SocketlessClient;
}

const aborted = () => Object.assign(new Error("read ECONNABORTED"), { code: "ECONNABORTED" });

beforeEach(() => h.warn.mockReset());

describe("idle database connection failures", () => {
  it("is the uncaught exception that restarted production when nothing listens", async () => {
    const pool = new pg.Pool({ Client: SocketlessClient as unknown as typeof pg.Client });
    const idle = await parkIdleClient(pool);

    expect(() => idle.emit("error", aborted())).toThrow("read ECONNABORTED");
    await pool.end();
  });

  it("logs the dropped connection and lets the next checkout open a fresh one", async () => {
    const pool = new pg.Pool({ Client: SocketlessClient as unknown as typeof pg.Client });
    attachIdleDatabaseClientErrorListener(pool);
    const idle = await parkIdleClient(pool);

    expect(() => idle.emit("error", aborted())).not.toThrow();
    expect(h.warn).toHaveBeenCalledWith(
      "Discarded an idle database connection after a network error",
      { code: "ECONNABORTED", error: "read ECONNABORTED" },
    );
    expect(pool.totalCount).toBe(0);
    expect(idle._ending).toBe(true);

    const replacement = await parkIdleClient(pool);
    expect(replacement).not.toBe(idle);
    expect(pool.totalCount).toBe(1);
    await pool.end();
  });

  it("still crashed when a checked-out connection dropped, because only idle clients were guarded", async () => {
    const pool = new pg.Pool({ Client: SocketlessClient as unknown as typeof pg.Client });
    attachIdleDatabaseClientErrorListener(pool);
    const client = await pool.connect();

    expect(() => (client as unknown as EventEmitter).emit("error", aborted())).toThrow(
      "read ECONNABORTED",
    );
    client.release(true);
    await pool.end();
  });

  it("logs a checked-out connection failure and discards the client when it is released", async () => {
    const pool = new pg.Pool({ Client: SocketlessClient as unknown as typeof pg.Client });
    attachIdleDatabaseClientErrorListener(pool);
    attachCheckedOutDatabaseClientErrorListener(pool);
    const client = await pool.connect();
    const socketless = client as unknown as SocketlessClient;

    expect(() => socketless.emit("error", aborted())).not.toThrow();
    expect(h.warn).toHaveBeenCalledWith("A database connection failed while in use", {
      code: "ECONNABORTED",
      error: "read ECONNABORTED",
    });

    // pg marks a client that lost its socket as not queryable.
    socketless._queryable = false;
    client.release();
    expect(pool.totalCount).toBe(0);
    expect(socketless._ending).toBe(true);
    await pool.end();
  });

  it("guards the API's shared pool", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/server-context.ts"), "utf8");
    expect(source).toContain(
      "if (databaseConnection) attachIdleDatabaseClientErrorListener(pool);",
    );
    expect(source).toContain(
      "if (databaseConnection) attachCheckedOutDatabaseClientErrorListener(pool);",
    );
  });
});
