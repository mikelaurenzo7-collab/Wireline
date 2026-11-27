import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two saves from Set Up that a browser tab opened before a release can get
 * wrong. Both were found in review of the change that made Auto the starting
 * permission: the old option names were reused with new meanings, and the
 * Playbook, which is saved whole, gained a list an old tab does not send.
 */
type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  owns: true,
  storedPlaybook: null as unknown,
  set: vi.fn(),
}));
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
vi.mock("../src/lib/paid-bot-identity", () => ({ PAID_BOT_IDENTITY_JOB_TYPE: "unused" }));
vi.mock("../src/lib/training-ai-spend", () => ({
  runTrainingStructured: vi.fn(),
  runTrainingImage: vi.fn(),
  isTrainingImageAvailable: () => false,
}));
vi.mock("../src/lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  drizzle: {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (!h.owns) return [];
            return "playbook" in fields ? [{ playbook: h.storedPlaybook }] : [{ id: "bot-a" }];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: () => {
          if (h.owns) h.set(values);
          return Object.assign(Promise.resolve(undefined), {
            returning: async () => (h.owns ? [{ id: "bot-a" }] : []),
          });
        },
      }),
    }),
  },
}));
import "../src/routes/agent-routes-v2";

async function call(route: string, body: unknown) {
  const json = vi.fn();
  await h.routes.get(route)!({ user: { id: "tenant-a" }, params: { id: "bot-a" }, body }, { json });
  return json;
}
const savePermission = (body: unknown) => call("patch /api/agents/:id/permission", body);
const savePlaybook = (playbook: unknown) =>
  call("patch /api/agent-config/:id/playbook", { playbook });

beforeEach(() => {
  h.owns = true;
  h.storedPlaybook = null;
  h.set.mockClear();
});

describe("saving a Bot's permission", () => {
  it.each([
    ["auto", "auto"],
    ["full", "full"],
    ["messages", "supervised"],
    ["ask", "draft"],
  ])("stores today's %s as %s and answers in today's names", async (autonomy, stored) => {
    const json = await savePermission({ autonomy });
    expect(h.set).toHaveBeenCalledExactlyOnceWith({ autonomyLevel: stored });
    expect(json).toHaveBeenCalledExactlyOnceWith({ id: "bot-a", autonomy });
  });

  // Before Auto, the screen's "auto" meant "check before it emails or texts",
  // and its "full" meant what is stored as `auto` today. A tab left open
  // across the release keeps sending those names in the old field.
  it.each([
    ["full", "auto"],
    ["auto", "supervised"],
    ["ask", "draft"],
  ])("reads %s from a tab opened before Auto with its old meaning: %s", async (level, stored) => {
    const json = await savePermission({ level });
    expect(h.set).toHaveBeenCalledExactlyOnceWith({ autonomyLevel: stored });
    // Answered in the old field, so the old screen's own check still passes.
    expect(json).toHaveBeenCalledExactlyOnceWith({ id: "bot-a", permission: level });
  });

  it("never stores a value an older release cannot read from an old tab", async () => {
    for (const level of ["full", "auto", "ask"]) await savePermission({ level });
    expect(h.set.mock.calls.map(([values]) => values.autonomyLevel)).not.toContain("full");
  });

  it.each([
    ["nothing", {}],
    ["a name nobody uses", { autonomy: "sometimes" }],
    ["today's name in the old field", { level: "messages" }],
    // Today's field wins. An unreadable value there is refused, never
    // replaced by whatever the old field happens to hold.
    ["an unreadable choice beside an old one", { autonomy: "sometimes", level: "full" }],
    ["an empty choice beside an old one", { autonomy: null, level: "full" }],
  ])("refuses %s and saves nothing", async (_name, body) => {
    await expect(savePermission(body)).rejects.toMatchObject({ status: 400 });
    expect(h.set).not.toHaveBeenCalled();
  });

  it("answers not found for a Bot the owner does not have", async () => {
    h.owns = false;
    await expect(savePermission({ autonomy: "auto" })).rejects.toMatchObject({ status: 404 });
    expect(h.set).not.toHaveBeenCalled();
  });
});

describe("saving a Playbook", () => {
  const stored = {
    exactLines: {},
    situations: [],
    alwaysMention: [],
    neverSay: ["guarantee"],
    checkFirst: ["A customer asks for a refund", "A quote over $500"],
  };
  // What a tab opened before "Check With Me First When" existed sends.
  const fromAnOldTab = {
    exactLines: {},
    situations: [],
    alwaysMention: ["We are open Saturdays"],
    neverSay: ["guarantee", "cheap"],
  };

  it("keeps the owner's check-first rules when the saved document does not name them", async () => {
    h.storedPlaybook = stored;
    const json = await savePlaybook(fromAnOldTab);
    const saved = {
      version: 1,
      exactLines: {},
      situations: [],
      alwaysMention: ["We are open Saturdays"],
      neverSay: ["guarantee", "cheap"],
      checkFirst: ["A customer asks for a refund", "A quote over $500"],
    };
    expect(h.set).toHaveBeenCalledExactlyOnceWith({ playbook: saved });
    expect(json).toHaveBeenCalledExactlyOnceWith({ success: true, playbook: saved });
  });

  it("keeps a Playbook that holds only those rules when an old tab clears the rest", async () => {
    h.storedPlaybook = stored;
    await savePlaybook({ exactLines: {}, situations: [], alwaysMention: [], neverSay: [] });
    expect(h.set).toHaveBeenCalledExactlyOnceWith({
      playbook: expect.objectContaining({ neverSay: [], checkFirst: stored.checkFirst }),
    });
  });

  it("lets today's screen replace the rules, and clear them", async () => {
    h.storedPlaybook = stored;
    await savePlaybook({ ...fromAnOldTab, checkFirst: ["  Any discount  "] });
    expect(h.set.mock.calls[0][0].playbook.checkFirst).toEqual(["Any discount"]);

    h.set.mockClear();
    await savePlaybook({ ...fromAnOldTab, checkFirst: [] });
    expect(h.set.mock.calls[0][0].playbook.checkFirst).toEqual([]);

    // An empty Playbook from today's screen clears the column.
    h.set.mockClear();
    await savePlaybook({
      exactLines: {},
      situations: [],
      alwaysMention: [],
      neverSay: [],
      checkFirst: [],
    });
    expect(h.set).toHaveBeenCalledExactlyOnceWith({ playbook: null });
  });

  it("has nothing to keep for a Bot with no stored rules", async () => {
    for (const storedPlaybook of [null, "not a playbook", { neverSay: ["guarantee"] }]) {
      h.set.mockClear();
      h.storedPlaybook = storedPlaybook;
      await savePlaybook(fromAnOldTab);
      expect(h.set.mock.calls[0][0].playbook.checkFirst).toEqual([]);
    }
  });

  it("answers not found for a Bot the owner does not have", async () => {
    h.owns = false;
    await expect(savePlaybook(fromAnOldTab)).rejects.toMatchObject({ status: 404 });
    expect(h.set).not.toHaveBeenCalled();
  });
});
