import { EventEmitter } from "node:events";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  runTenantScopedPoolQuery,
  scopePgClientToTenant,
} from "../src/lib/tenant-pool-transaction";

const USER_ID = "77e92712-8401-4a90-899c-b16213289ce3";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type QueryCallback = (error?: Error, result?: unknown) => void;

class FakePoolClient extends EventEmitter {
  readonly queries: Array<{ text: string; values: unknown }> = [];
  readonly releases: Array<Error | boolean | undefined> = [];
  readonly handlers = new Map<string, () => Promise<unknown>>();

  query(config: unknown, valuesOrCallback?: unknown, callback?: unknown): Promise<unknown> | void {
    const text =
      typeof config === "string"
        ? config
        : typeof config === "object" && config && "text" in config
          ? String(config.text)
          : String(config);
    const queryCallback =
      typeof valuesOrCallback === "function"
        ? (valuesOrCallback as QueryCallback)
        : typeof callback === "function"
          ? (callback as QueryCallback)
          : undefined;
    const values = typeof valuesOrCallback === "function" ? undefined : valuesOrCallback;
    this.queries.push({ text, values });

    const result = (this.handlers.get(text)?.() ??
      Promise.resolve({ rows: [{ ok: true }] })) as Promise<unknown>;
    if (!queryCallback) return result;
    void result.then(
      (value) => queryCallback(undefined, value),
      (error) => queryCallback(error instanceof Error ? error : new Error(String(error))),
    );
  }

  release(error?: Error | boolean): void {
    this.releases.push(error);
  }

  asPoolClient(): PoolClient {
    return this as unknown as PoolClient;
  }
}

async function waitForQuery(client: FakePoolClient, text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (client.queries.some((query) => query.text === text)) return;
    await Promise.resolve();
  }
  throw new Error(`Query was not dispatched: ${text}`);
}

describe("tenant pool transaction finalization", () => {
  it("does not resolve a one-shot pool query or release its client before outer COMMIT", async () => {
    const client = new FakePoolClient();
    const commit = deferred<unknown>();
    const selected = { rows: [{ id: "row-1" }] };
    client.handlers.set("SELECT id FROM work WHERE id = $1", () => Promise.resolve(selected));
    client.handlers.set("COMMIT", () => commit.promise);

    const query = runTenantScopedPoolQuery(
      async () => client.asPoolClient(),
      USER_ID,
      "SELECT id FROM work WHERE id = $1",
      ["row-1"],
    ) as Promise<unknown>;
    let settled = false;
    void query.then(() => {
      settled = true;
    });

    await waitForQuery(client, "COMMIT");
    expect(settled).toBe(false);
    expect(client.releases).toEqual([]);

    commit.resolve({ rows: [] });
    await expect(query).resolves.toBe(selected);
    await Promise.resolve();
    expect(client.releases).toEqual([undefined]);
    expect(client.queries.map(({ text }) => text)).toEqual([
      "BEGIN",
      "SET TRANSACTION READ WRITE",
      "SET LOCAL ROLE wireline_server",
      "SELECT set_config('app.current_user_id', $1, true)",
      "SELECT id FROM work WHERE id = $1",
      "COMMIT",
    ]);
  });

  it("rejects a one-shot query with the outer COMMIT error and discards the client", async () => {
    const client = new FakePoolClient();
    const commit = deferred<unknown>();
    const commitError = new Error("commit acknowledgement lost");
    client.handlers.set("COMMIT", () => commit.promise);

    const query = runTenantScopedPoolQuery(
      async () => client.asPoolClient(),
      USER_ID,
      "UPDATE work SET done = true",
    ) as Promise<unknown>;

    await waitForQuery(client, "COMMIT");
    expect(client.releases).toEqual([]);
    commit.reject(commitError);

    await expect(query).rejects.toBe(commitError);
    await Promise.resolve();
    expect(client.releases).toEqual([commitError]);
  });

  it("waits for outer ROLLBACK before surfacing a one-shot query failure", async () => {
    const client = new FakePoolClient();
    const rollback = deferred<unknown>();
    const queryError = new Error("statement failed");
    client.handlers.set("DELETE FROM work", () => Promise.reject(queryError));
    client.handlers.set("ROLLBACK", () => rollback.promise);

    const query = runTenantScopedPoolQuery(
      async () => client.asPoolClient(),
      USER_ID,
      "DELETE FROM work",
    ) as Promise<unknown>;

    await waitForQuery(client, "ROLLBACK");
    expect(client.releases).toEqual([]);
    rollback.resolve({ rows: [] });

    await expect(query).rejects.toBe(queryError);
    await Promise.resolve();
    expect(client.releases).toEqual([queryError]);
  });

  it("preserves the pg values-plus-callback Pool.query overload", async () => {
    const client = new FakePoolClient();
    const callback = vi.fn<QueryCallback>();
    const selected = { rows: [{ id: "row-2" }] };
    client.handlers.set("SELECT id FROM work WHERE id = $1", () => Promise.resolve(selected));

    const returned = runTenantScopedPoolQuery(
      async () => client.asPoolClient(),
      USER_ID,
      "SELECT id FROM work WHERE id = $1",
      ["row-2"],
      callback,
    );

    expect(returned).toBeUndefined();
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(callback).toHaveBeenCalledWith(undefined, selected);
    expect(client.queries.find(({ text }) => text.startsWith("SELECT id"))?.values).toEqual([
      "row-2",
    ]);
    expect(client.releases).toEqual([undefined]);
  });

  it("restores the raw client methods before returning a reusable client to the pool", async () => {
    const client = new FakePoolClient();
    const acquire = async () => client.asPoolClient();

    await runTenantScopedPoolQuery(acquire, USER_ID, "SELECT 1");
    await Promise.resolve();
    await runTenantScopedPoolQuery(acquire, USER_ID, "SELECT 2");
    await Promise.resolve();

    expect(client.releases).toEqual([undefined, undefined]);
    expect(client.queries.filter(({ text }) => text === "BEGIN")).toHaveLength(2);
    expect(client.queries.filter(({ text }) => text === "COMMIT")).toHaveLength(2);
  });

  it("makes Drizzle-style COMMIT and ROLLBACK controls await outer finalization", async () => {
    const commitClient = new FakePoolClient();
    const commit = deferred<unknown>();
    commitClient.handlers.set("COMMIT", () => commit.promise);
    const committed = await scopePgClientToTenant(commitClient.asPoolClient(), USER_ID);

    await committed.client.query("begin");
    const commitQuery = committed.client.query("commit") as Promise<unknown>;
    await waitForQuery(commitClient, "COMMIT");
    expect(commitClient.releases).toEqual([]);
    commit.resolve({ rows: [] });
    await expect(commitQuery).resolves.toEqual({ rows: [{ ok: true }] });
    committed.client.release();
    await Promise.resolve();
    expect(commitClient.releases).toEqual([undefined]);
    expect(commitClient.queries.map(({ text }) => text)).toContain(
      "SAVEPOINT __wireline_tenant_sp__",
    );
    expect(commitClient.queries.map(({ text }) => text)).toContain(
      "RELEASE SAVEPOINT __wireline_tenant_sp__",
    );

    const rollbackClient = new FakePoolClient();
    const rollback = deferred<unknown>();
    rollbackClient.handlers.set("ROLLBACK", () => rollback.promise);
    const rolledBack = await scopePgClientToTenant(rollbackClient.asPoolClient(), USER_ID);

    await rolledBack.client.query("begin");
    const rollbackQuery = rolledBack.client.query("rollback") as Promise<unknown>;
    await waitForQuery(rollbackClient, "ROLLBACK");
    expect(rollbackClient.releases).toEqual([]);
    rollback.resolve({ rows: [] });
    await expect(rollbackQuery).resolves.toEqual({ rows: [{ ok: true }] });
    rolledBack.client.release();
    await Promise.resolve();
    expect(rollbackClient.releases).toEqual([undefined]);
    expect(rollbackClient.queries.map(({ text }) => text)).toContain(
      "ROLLBACK TO SAVEPOINT __wireline_tenant_sp__",
    );
  });

  it("preserves a failed outer COMMIT through Drizzle's follow-up rollback", async () => {
    const client = new FakePoolClient();
    const commitError = new Error("serialization failure during commit");
    client.handlers.set("COMMIT", () => Promise.reject(commitError));
    const scoped = await scopePgClientToTenant(client.asPoolClient(), USER_ID);

    await scoped.client.query("begin");
    await expect(scoped.client.query("commit")).rejects.toBe(commitError);
    await expect(scoped.client.query("rollback")).resolves.toBeUndefined();
    scoped.client.release();
    await Promise.resolve();

    expect(client.queries.map(({ text }) => text)).not.toContain(
      "ROLLBACK TO SAVEPOINT __wireline_tenant_sp__",
    );
    expect(client.queries.map(({ text }) => text)).toContain("ROLLBACK");
    expect(client.releases).toEqual([commitError]);
  });
});
