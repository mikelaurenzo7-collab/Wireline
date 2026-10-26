import { getTableName, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; userId: string; businessVariables: unknown };
const h = vi.hoisted(() => ({
  agents: [] as Row[],
  voice: {} as Record<string, unknown>,
  beforeAgentWrite: null as null | (() => Promise<void>),
  beforeVoiceWrite: null as null | (() => Promise<void>),
  voiceLockTail: Promise.resolve(),
  onVoiceLockRequested: null as null | (() => void),
  remove: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: createDatabase(),
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  tenantStore: { run: (_id: string, work: () => unknown) => work() },
}));

type Transaction = { releaseVoiceLock?: () => void };
/** Model SQL write/row-lock ordering; this suite does not connect to PostgreSQL. */
function createDatabase(transaction?: Transaction) {
  return {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: (condition: SQL) => {
          let lock = false;
          const read = async () => {
            if (lock) {
              expect(transaction).toBeDefined();
              transaction!.releaseVoiceLock ??= await lockVoice();
            }
            const query = dialect.sqlToQuery(condition);
            const rows = getTableName(table) === "wireline_agents" ? h.agents : [h.voice];
            return structuredClone(rows.filter((row) => matches(row, query)));
          };
          const query = {
            limit: () => query,
            for: (mode: string) => {
              expect(mode).toBe("update");
              lock = true;
              return query;
            },
            then: (resolve: (rows: unknown[]) => void, reject: (error: unknown) => void) =>
              read().then(resolve, reject),
          };
          return query;
        },
      }),
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (condition: SQL) => {
          let result: Promise<{ id: string }[]> | undefined;
          const execute = () =>
            (result ??= (async () => {
              const agents = getTableName(table) === "wireline_agents";
              const release = agents ? null : await lockVoice();
              try {
                const hook = agents ? "beforeAgentWrite" : "beforeVoiceWrite";
                if (h[hook]) {
                  const before = h[hook];
                  h[hook] = null;
                  await before();
                }
                const query = dialect.sqlToQuery(condition);
                const rows = (agents ? h.agents : [h.voice]).filter((row) => matches(row, query));
                for (const row of rows) {
                  for (const [key, value] of Object.entries(patch)) {
                    (row as Record<string, unknown>)[key] =
                      value instanceof SQL
                        ? applyJsonUpdate(row.businessVariables, value)
                        : structuredClone(value);
                  }
                }
                return rows.map((row) => ({ id: String(row.id) }));
              } finally {
                release?.();
              }
            })());
          return {
            returning: execute,
            then: (resolve: (rows: { id: string }[]) => void, reject: (error: unknown) => void) =>
              execute().then(resolve, reject),
          };
        },
      }),
    }),
    transaction: async (operation: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
      const state: Transaction = {};
      try {
        return await operation(createDatabase(state));
      } finally {
        state.releaseVoiceLock?.();
      }
    },
  };
}

async function lockVoice(): Promise<() => void> {
  let release!: () => void;
  const prior = h.voiceLockTail;
  h.voiceLockTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.onVoiceLockRequested?.();
  await prior;
  return release;
}
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({
    perform,
  }: {
    perform: () => Promise<unknown>;
  }) => ({ performed: true, result: await perform() }),
}));
vi.mock("../src/middleware/audit-middleware", () => ({
  reservePlatformCostRecord: vi.fn(),
  commitPlatformCostReservation: vi.fn(),
}));
vi.mock("../src/lib/voice/clone-engines", () => ({
  cloneEngine: () => ({ id: "elevenlabs", remove: h.remove }),
  isCloneEngineId: () => true,
  CloneEngineError: class extends Error {},
}));
vi.mock("../src/lib/voice/cloned-speech-stream", () => ({ renderClonedStockPreview: vi.fn() }));
vi.mock("../src/lib/voice/voice-sample", () => ({ voiceSampleLine: vi.fn() }));

import { liveVoiceService, LIVE_CUSTOM_VOICE_KEY } from "../src/lib/voice/live-voice-service";
import { PHONE_CATALOG_VOICE_KEY } from "../src/lib/phone-voice-catalog";

const dialect = new PgDialect();
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CLONE = "33333333-3333-4333-8333-333333333333";
const REPLACEMENT = "44444444-4444-4444-8444-444444444444";
const actor = { id: OWNER };
type Query = ReturnType<PgDialect["sqlToQuery"]>;
function matches(row: Record<string, unknown> | Row, query: Query): boolean {
  for (const [column, key] of [
    ["user_id", "userId"],
    ["id", "id"],
    ["status", "status"],
  ]) {
    const parameter = query.sql.match(new RegExp(`\\."${column}" = \\$(\\d+)`));
    if (
      parameter &&
      (row as Record<string, unknown>)[key] !== query.params[Number(parameter[1]) - 1]
    )
      return false;
  }
  const clone = query.sql.match(/->\$(\d+)->>'cloneId' = \$(\d+)/);
  if (clone) {
    const variables = object(row.businessVariables);
    const selected = object(variables[String(query.params[Number(clone[1]) - 1])]);
    if (selected.cloneId !== query.params[Number(clone[2]) - 1]) return false;
  }
  return true;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}
/** Apply compiled PostgreSQL JSON operators to the row at write time, not the read snapshot. */
function applyJsonUpdate(current: unknown, expression: SQL): Record<string, unknown> {
  const query = dialect.sqlToQuery(expression);
  expect(query.sql).toContain("jsonb_typeof");
  const variables = object(current);
  for (const parameter of query.sql.matchAll(/ - \$(\d+)/g))
    delete variables[String(query.params[Number(parameter[1]) - 1])];
  const set = query.sql.match(/ARRAY\[\$(\d+)\], \$(\d+)::jsonb/);
  if (set)
    variables[String(query.params[Number(set[1]) - 1])] = JSON.parse(
      String(query.params[Number(set[2]) - 1]),
    );
  return variables;
}
function pauseWrite(hook: "beforeAgentWrite" | "beforeVoiceWrite" = "beforeAgentWrite") {
  let arrive!: () => void;
  let release!: () => void;
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  h[hook] = async () => {
    arrive();
    await released;
  };
  return { arrived, release };
}
const selected = (cloneId = CLONE) => ({ [LIVE_CUSTOM_VOICE_KEY]: { cloneId } });
beforeEach(() => {
  h.agents = [
    { id: "bot", userId: OWNER, businessVariables: { ...selected(), greeting: "Original" } },
  ];
  h.voice = {
    id: CLONE,
    userId: OWNER,
    name: "My Voice",
    status: "ready",
    provider: "elevenlabs",
    providerVoiceId: "provider-voice",
  };
  h.beforeAgentWrite = null;
  h.beforeVoiceWrite = null;
  h.onVoiceLockRequested = null;
  h.voiceLockTail = Promise.resolve();
  h.remove.mockReset().mockResolvedValue(undefined);
});

describe("atomic cloned voice selection", () => {
  it("rejects assignment when deletion takes the voice lock first", async () => {
    const gate = pauseWrite("beforeVoiceWrite");
    const deleting = liveVoiceService.remove(actor, CLONE);
    await gate.arrived;
    const queued = new Promise<void>((resolve) => {
      h.onVoiceLockRequested = resolve;
    });
    const saving = expect(liveVoiceService.useOnBot(actor, CLONE, "bot")).rejects.toMatchObject({
      status: 404,
    });
    await queued;
    gate.release();
    await Promise.all([deleting, saving]);
    expect(h.voice.status).toBe("deleted");
    expect(h.agents[0].businessVariables).toEqual({ greeting: "Original" });
  });

  it("holds the voice lock through assignment so later deletion clears the committed selection", async () => {
    const gate = pauseWrite();
    const saving = liveVoiceService.useOnBot(actor, CLONE, "bot");
    await gate.arrived;
    const queued = new Promise<void>((resolve) => {
      h.onVoiceLockRequested = resolve;
    });
    const deleting = liveVoiceService.remove(actor, CLONE);
    await queued;
    expect(h.voice.status).toBe("ready");
    expect(h.remove).not.toHaveBeenCalled();
    gate.release();
    await Promise.all([saving, deleting]);
    expect(h.voice.status).toBe("deleted");
    expect(h.agents[0].businessVariables).toEqual({ greeting: "Original" });
  });

  it("preserves a concurrent setup save while assigning a clone and removes only the catalog selection", async () => {
    const gate = pauseWrite();
    const saving = liveVoiceService.useOnBot(actor, CLONE, "bot");
    await gate.arrived;
    h.agents[0].businessVariables = {
      greeting: "New Greeting",
      handoff: { phone: "saved" },
      [PHONE_CATALOG_VOICE_KEY]: { id: "catalog-voice" },
    };
    gate.release();
    await saving;
    expect(h.agents[0].businessVariables).toEqual({
      greeting: "New Greeting",
      handoff: { phone: "saved" },
      [LIVE_CUSTOM_VOICE_KEY]: { cloneId: CLONE, name: "My Voice", selectedAt: expect.any(String) },
    });
  });

  it("preserves a concurrent setup save when switching to the built-in voice", async () => {
    const gate = pauseWrite();
    const saving = liveVoiceService.useStock(actor, "bot");
    await gate.arrived;
    h.agents[0].businessVariables = {
      ...selected(),
      greeting: "New Greeting",
      [PHONE_CATALOG_VOICE_KEY]: { id: "catalog-voice" },
    };
    gate.release();
    await saving;
    expect(h.agents[0].businessVariables).toEqual({ greeting: "New Greeting" });
  });

  it("cleans only the still-selected clone and preserves replacement voices, settings, and other tenants", async () => {
    h.agents.push({
      id: "same-clone",
      userId: OWNER,
      businessVariables: { ...selected(), untouched: true },
    });
    h.agents.push({ id: "other-tenant", userId: OTHER, businessVariables: selected() });
    const gate = pauseWrite();
    const deleting = liveVoiceService.remove(actor, CLONE);
    await gate.arrived;
    h.agents[0].businessVariables = { ...selected(REPLACEMENT), greeting: "New Greeting" };
    gate.release();
    await deleting;
    expect(h.agents.map((row) => row.businessVariables)).toEqual([
      { ...selected(REPLACEMENT), greeting: "New Greeting" },
      { untouched: true },
      selected(),
    ]);
    expect(h.voice.status).toBe("deleted");
    expect(h.remove).toHaveBeenCalledOnce();
  });

  it.each([null, [], "legacy", 42])(
    "normalizes non-object legacy settings (%j) without rejecting voice changes",
    async (value) => {
      h.agents[0].businessVariables = value;
      await liveVoiceService.useOnBot(actor, CLONE, "bot");
      expect(object(h.agents[0].businessVariables)[LIVE_CUSTOM_VOICE_KEY]).toMatchObject({
        cloneId: CLONE,
      });
      h.agents[0].businessVariables = value;
      await liveVoiceService.useStock(actor, "bot");
      expect(h.agents[0].businessVariables).toEqual({});
    },
  );

  it("cannot assign another tenant's clone or mutate another tenant's Bot", async () => {
    h.agents[0].userId = OTHER;
    await expect(liveVoiceService.useOnBot(actor, CLONE, "bot")).rejects.toMatchObject({
      status: 404,
    });
    await expect(liveVoiceService.useStock(actor, "bot")).rejects.toMatchObject({ status: 404 });
    expect(h.agents[0].businessVariables).toEqual({ ...selected(), greeting: "Original" });
    h.agents[0].userId = OWNER;
    h.voice.userId = OTHER;
    await expect(liveVoiceService.useOnBot(actor, CLONE, "bot")).rejects.toMatchObject({
      status: 404,
    });
    expect(h.agents[0].businessVariables).toEqual({ ...selected(), greeting: "Original" });
  });
});
