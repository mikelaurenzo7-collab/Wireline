import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  notes: [] as Array<{ id: bigint; content: string }>,
  owns: true,
  tail: Promise.resolve(),
  conflict: false,
  writes: 0,
}));
vi.mock("../src/lib/server-context", async () => {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const checkScope = (condition: Parameters<typeof dialect.sqlToQuery>[0], expected: unknown[]) => {
    const query = dialect.sqlToQuery(condition);
    expect(query.params).toEqual(expected);
    return query;
  };
  const connection = (lock?: () => Promise<void>) => ({
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
          const agent = getTableName(table) === "wireline_agents";
          checkScope(condition, agent ? ["bot", "tenant"] : ["tenant", "bot", "owner_memory"]);
          const query = {
            orderBy: () => query,
            limit: () =>
              agent
                ? {
                    for: async (mode: string) => {
                      expect(mode).toBe("update");
                      await lock?.();
                      return state.owns ? [{ id: "bot" }] : [];
                    },
                  }
                : Promise.resolve([...state.notes]),
          };
          return query;
        },
      }),
    }),
    insert: () => ({
      values: (value: { userId: string; agentId: string; lesson: string; source: string }) => {
        expect(value).toMatchObject({ userId: "tenant", agentId: "bot", source: "owner_memory" });
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              if (state.conflict) return [];
              state.writes += 1;
              const note = { id: BigInt(state.writes), content: value.lesson };
              state.notes.push(note);
              return [{ id: note.id }];
            },
          }),
        };
      },
    }),
    delete: () => ({
      where: async (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
        const query = checkScope(condition, ["tenant", "bot", "owner_memory", 42n]);
        state.notes = state.notes.filter((note) => note.id !== query.params[3]);
      },
    }),
  });
  return {
    drizzle: {
      ...connection(),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        let unlock: (() => void) | undefined;
        const tx = connection(async () => {
          const prior = state.tail;
          state.tail = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          await prior;
        });
        try {
          return await fn(tx);
        } finally {
          unlock?.();
        }
      },
    },
  };
});

import { changeOwnerMemory, loadOwnerMemories } from "../src/lib/owner-memory-store";

beforeEach(() => {
  state.notes = [];
  state.owns = true;
  state.conflict = false;
  state.writes = 0;
  state.tail = Promise.resolve();
});
describe("owner memory persistence", () => {
  it("rejects foreign or missing Bots before writing", async () => {
    state.owns = false;
    await expect(
      changeOwnerMemory("tenant", "bot", { action: "add", content: "Private note" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(state.writes).toBe(0);
  });
  it("makes repeated saves idempotent and serializes the 20-note admission limit", async () => {
    state.notes = Array.from({ length: 19 }, (_, index) => ({
      id: BigInt(index + 100),
      content: `Note ${index}`,
    }));
    await Promise.all([
      changeOwnerMemory("tenant", "bot", { action: "add", content: "Last note" }),
      changeOwnerMemory("tenant", "bot", { action: "add", content: "Last note" }),
    ]);
    expect(state.notes).toHaveLength(20);
    expect(state.writes).toBe(1);
    await expect(
      changeOwnerMemory("tenant", "bot", { action: "add", content: "Extra note" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("cannot overwrite a learned lesson when text collides", async () => {
    state.conflict = true;
    await expect(
      changeOwnerMemory("tenant", "bot", { action: "add", content: "Existing lesson" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.writes).toBe(0);
  });
  it("scopes reads and deletes to the owner, Bot and private source", async () => {
    state.notes = [{ id: 42n, content: "Private note" }];
    expect(await loadOwnerMemories("tenant", "bot")).toEqual([
      { id: "42", content: "Private note" },
    ]);
    await changeOwnerMemory("tenant", "bot", { action: "delete", id: 42n });
    expect(state.notes).toEqual([]);
  });
});
