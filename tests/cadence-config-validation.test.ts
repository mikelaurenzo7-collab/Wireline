import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  write: vi.fn(),
  ownedAgents: [{ id: "owned-bot" }],
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
vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn() },
  drizzle: {
    select: () => ({ from: () => ({ where: async () => h.ownedAgents }) }),
    insert: () => ({ values: h.write }),
    update: () => ({ set: h.write }),
  },
}));

import "../src/routes/cadence-routes";
import { createCadenceSchema, updateCadenceSchema } from "../src/lib/api-validation-base";

function invoke(method: "post" | "patch", body: unknown) {
  return h.routes.get(`${method} /api/cadences${method === "patch" ? "/:id" : ""}`)!(
    { user: { id: "tenant" }, params: { id: "sequence" }, body },
    { json: vi.fn() },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const returning = async () => [{ id: "sequence" }];
  h.write.mockReturnValue({ returning, where: () => ({ returning }) });
});

describe("sequence configuration admission", () => {
  it.each(["post", "patch"] as const)("rejects a foreign default Bot on %s", async (method) => {
    await expect(
      invoke(method, {
        name: "Follow Up",
        agentId: "foreign-bot",
        steps: [{ type: "sms", delayHours: 0 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(h.write).not.toHaveBeenCalled();
  });

  it.each(["post", "patch"] as const)("rejects a foreign step Bot on %s", async (method) => {
    await expect(
      invoke(method, {
        name: "Follow Up",
        agentId: "owned-bot",
        steps: [{ type: "call", delayHours: 0, agentId: "foreign-bot" }],
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(h.write).not.toHaveBeenCalled();
  });

  it("accepts tenant-owned default and step Bots", async () => {
    await invoke("post", {
      name: "Follow Up",
      agentId: "owned-bot",
      steps: [{ type: "sms", delayHours: 0, agentId: "owned-bot" }],
    });
    expect(h.write).toHaveBeenCalledOnce();
  });

  it("rejects a delay that cannot produce a valid schedule", async () => {
    await expect(
      invoke("post", { name: "Follow Up", steps: [{ type: "sms", delayHours: 1e100 }] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.write).not.toHaveBeenCalled();
  });

  it("does not expose database details as a validation error", async () => {
    h.write.mockImplementation(() => {
      throw new Error("SQL failed: internal schema details");
    });
    await expect(
      invoke("post", { name: "Follow Up", steps: [{ type: "sms", delayHours: 0 }] }),
    ).rejects.toMatchObject({ status: 500, message: "Could not save this sequence." });
  });

  it("rejects blank names and empty updates before persistence", async () => {
    expect(
      createCadenceSchema.safeParse({ name: "   ", steps: [{ type: "sms", delayHours: 0 }] })
        .success,
    ).toBe(false);
    expect(updateCadenceSchema.safeParse({ unrelated: true }).success).toBe(false);
    await expect(invoke("patch", {})).rejects.toMatchObject({ status: 400 });
    expect(h.write).not.toHaveBeenCalled();
  });
});
