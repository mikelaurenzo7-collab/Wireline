import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "../src/db/schema";

/**
 * A new Bot whose owner typed no name is named by the server, from the Bots
 * the workspace has at that moment. The create dialog only guesses at that
 * list, and has nothing to guess from when the list failed to load.
 */
type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  existing: [] as Array<{ id: string; name: string; markKey: null; timezone: null }>,
  inserted: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
}));
const tx = {
  execute: async () => undefined,
  select: () => ({ from: () => ({ where: async () => h.existing }) }),
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      h.inserted.push({ table, values });
      return Object.assign(Promise.resolve(undefined), {
        onConflictDoUpdate: async () => undefined,
      });
    },
  }),
};
vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path: string, ...handlers: Handler[]) =>
          h.routes.set(`${method} ${path}`, handlers.at(-1)!),
      ]),
    ),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/middleware/api-rate-limits", () => ({ agentMutationRateLimit: () => {} }));
vi.mock("../src/lib/agents-store", () => ({ listAgentsForUser: vi.fn() }));
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: vi.fn() }));
vi.mock("../src/lib/agent-entitlements", () => ({
  agentCapMessage: vi.fn(),
  resolveAgentEntitlement: vi.fn(),
}));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));
vi.mock("../src/lib/paid-bot-identity", () => ({ PAID_BOT_IDENTITY_JOB_TYPE: "identity" }));
vi.mock("../src/lib/training-ai-spend", () => ({
  runTrainingStructured: vi.fn(),
  runTrainingImage: vi.fn(),
  isTrainingImageAvailable: () => false,
}));
vi.mock("../src/lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  drizzle: { transaction: (work: (handle: typeof tx) => unknown) => work(tx) },
}));
import "../src/routes/agent-routes-v2";

async function create(body: Record<string, unknown>) {
  const json = vi.fn();
  const res = { status: vi.fn(() => res), json };
  await h.routes.get("post /api/agents")!({ user: { id: "tenant-a" }, params: {}, body }, res);
  const bot = h.inserted.find((insert) => insert.table === schema.agents)?.values;
  return { status: res.status.mock.calls.at(-1)?.[0], answer: json.mock.calls.at(-1)?.[0], bot };
}
const workspaceHas = (...names: string[]) => {
  h.existing = names.map((name, index) => ({
    id: `bot-${index}`,
    name,
    markKey: null,
    timezone: null,
  }));
};

beforeEach(() => {
  h.existing = [];
  h.inserted = [];
});

describe("creating a Bot with the name left empty", () => {
  it("names a workspace's first Bot Bo, with the greeting that carries the name", async () => {
    // What the dialog sends: its own guess as `name`, and the role.
    const { status, answer, bot } = await create({ name: "Bo", role_name: "Front Desk" });
    expect(status).toBe(201);
    expect(bot).toMatchObject({ name: "Bo", firstMessage: "Hi, this is Bo. How can I help?" });
    expect(answer).toMatchObject({ name: "Bo" });
  });

  it("goes by the Bots the workspace really has, not the dialog's guess", async () => {
    // The dialog could not load the list, so it guessed Bo. There is one already.
    workspaceHas("Bo");
    const { answer, bot } = await create({ name: "Bo", role_name: "Front Desk" });
    expect(bot).toMatchObject({
      name: "Front Desk",
      firstMessage: "Hi, this is Front Desk. How can I help?",
    });
    expect(answer).toMatchObject({ name: "Front Desk" });
  });

  it("numbers a role the workspace already has", async () => {
    workspaceHas("Bo", "Front Desk");
    expect((await create({ name: "Front Desk", role_name: "Front Desk" })).bot).toMatchObject({
      name: "Front Desk 2",
    });
  });
});

describe("creating a Bot with a name the owner typed", () => {
  it("keeps the name as typed, even one another Bot has", async () => {
    workspaceHas("Bo", "Nora");
    const { answer, bot } = await create({ name: "  Nora " });
    expect(bot).toMatchObject({ name: "Nora", firstMessage: "Hi, this is Nora. How can I help?" });
    expect(answer).toMatchObject({ name: "Nora" });
  });

  it("still takes a name alone, as a screen from before this release sends it", async () => {
    workspaceHas("Bo");
    expect((await create({ name: "Front Desk" })).bot).toMatchObject({ name: "Front Desk" });
  });

  it("refuses a request with neither a name nor a role, and creates nothing", async () => {
    for (const body of [{}, { name: "  " }, { name: 7 }, { role_name: " " }]) {
      await expect(create(body)).rejects.toMatchObject({ status: 400 });
    }
    expect(h.inserted).toEqual([]);
  });
});
