import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionItem, ActionResult } from "../src/lib/action-types";

// The ledger's own key-building and claiming run here, over an in-memory
// audit log that answers its two lookups: one key exactly, or a key prefix.
type Row = { id: bigint; resourceId: string; metadata: Record<string, unknown> };
const h = vi.hoisted(() => ({ records: [] as Row[] }));
vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const db = {
    select: () => {
      let condition: any;
      const query = {
        from: () => query,
        where: (value: unknown) => {
          condition = value;
          return query;
        },
        limit: () => query,
        orderBy: () => query,
        for: () => query,
        then: (resolve: (rows: Row[]) => unknown) => {
          const compiled = dialect.sqlToQuery(condition);
          expect(compiled.params).toContain("tenant");
          const key = compiled.params.find(
            (param): param is string => typeof param === "string" && /^(auto|draft):/.test(param),
          );
          const byPrefix = compiled.sql.includes("starts_with");
          return Promise.resolve(
            h.records.filter((row) =>
              byPrefix ? row.resourceId.startsWith(String(key)) : row.resourceId === key,
            ),
          ).then(resolve);
        },
      };
      return query;
    },
    insert: () => ({
      values: (row: Omit<Row, "id">) => ({
        returning: async () => {
          const id = BigInt(h.records.length + 1);
          h.records.push({ ...row, id });
          return [{ id }];
        },
      }),
    }),
    update: () => ({
      set: (patch: { metadata: any }) => ({
        where: async (condition: any) => {
          const id = String(dialect.sqlToQuery(condition).params[0]);
          const row = h.records.find((record) => String(record.id) === id);
          const merged = JSON.parse(String(dialect.sqlToQuery(patch.metadata).params[0]));
          if (row) row.metadata = { ...row.metadata, ...merged };
        },
      }),
    }),
    execute: async () => [],
    transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(db),
  };
  return { drizzle: db, log: { error: vi.fn(), warn: vi.fn() } };
});

import {
  hasOtherAutonomousExecution,
  runIdempotentActionExecution,
} from "../src/lib/action-execution-idempotency";

const text = (body: string, extra: Partial<ActionItem> = {}): ActionItem => ({
  type: "send_text_message",
  priority: "medium",
  agentId: "bot-1",
  payload: { to: "+17735550100", body },
  ...extra,
});
const call = { userId: "tenant", sourceId: "call-1", sourceType: "phone_call" };

/** Run one action through the ledger; report what it saw of the others. */
async function run(
  action: ActionItem,
  outcome: ActionResult,
  options: { phase?: "auto" | "draft"; sourceId?: string } = {},
): Promise<boolean | "not run"> {
  const source = { ...call, ...(options.sourceId ? { sourceId: options.sourceId } : {}) };
  let seen: boolean | "not run" = "not run";
  await runIdempotentActionExecution({
    ...source,
    action,
    phase: options.phase ?? "auto",
    execute: async () => {
      seen = await hasOtherAutonomousExecution({ ...source, action });
      return outcome;
    },
  });
  return seen;
}

beforeEach(() => {
  h.records = [];
});

describe("one text of the Bot's own per call", () => {
  it("does not count the text it is sending, and counts the same request worded another way", async () => {
    const sent: ActionResult = { success: true };
    expect(await run(text("We are at 12 Main St."), sent)).toBe(false);
    // The same request, read from the transcript again and worded differently.
    expect(await run(text("Our address is 12 Main Street."), sent)).toBe(true);
    // The identical action never runs twice at all: the ledger answers it.
    expect(await run(text("We are at 12 Main St."), sent)).toBe("not run");
  });

  it("counts a text still being sent and one whose outcome is not known", async () => {
    let whileSending: boolean | undefined;
    await runIdempotentActionExecution({
      ...call,
      action: text("We are at 12 Main St."),
      phase: "auto",
      execute: async () => {
        whileSending = await run(text("Our address is 12 Main Street."), { success: true });
        return { success: true };
      },
    });
    expect(whileSending).toBe(true);

    h.records = [];
    // Failed without saying nothing left: it may have reached the carrier.
    await run(text("We are at 12 Main St."), { success: false, error: "Carrier timed out" });
    expect(await run(text("Our address is 12 Main Street."), { success: true })).toBe(true);
  });

  it("leaves room after a text that was refused before it reached a carrier", async () => {
    await run(text("We are at 12 Main St."), {
      success: false,
      retryable: true,
      errorCode: "UNATTENDED_TEXT_READS_AS_SALES",
      error: "It reads as sales.",
    });
    expect(await run(text("Our address is 12 Main Street."), { success: true })).toBe(false);
  });

  it("looks only at the Bot's own texts for this call", async () => {
    const sent: ActionResult = { success: true };
    // A text the owner was asked to send, an email, and another call's text.
    await run(text("Waiting for the owner."), { success: true, queued: true }, { phase: "draft" });
    await run(
      { type: "send_email", priority: "medium", agentId: "bot-1", payload: { to: "a@b.test" } },
      sent,
    );
    await run(text("Another call."), sent, { sourceId: "call-2" });
    // A call id that merely starts the same way is a different call.
    await run(text("A longer call id."), sent, { sourceId: "call-10" });
    expect(await run(text("We are at 12 Main St."), sent)).toBe(false);
  });
});
