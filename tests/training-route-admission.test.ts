import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/api-error";
import * as schema from "../src/db/schema";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  owned: true,
  alreadySaved: false,
  train: vi.fn(),
  image: vi.fn(),
  transaction: vi.fn(),
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
vi.mock("../src/lib/training-ai-spend", () => ({
  runTrainingStructured: h.train,
  runTrainingImage: h.image,
  isTrainingImageAvailable: () => false,
}));
vi.mock("../src/lib/server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn() },
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (h.owned ? [{ id: "bot", alreadySaved: h.alreadySaved }] : []),
        }),
      }),
    }),
    transaction: h.transaction,
  },
}));
vi.mock("../src/lib/agents-store", () => ({ listAgentsForUser: vi.fn() }));
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: vi.fn() }));
vi.mock("../src/lib/agent-entitlements", () => ({
  agentCapMessage: vi.fn(),
  resolveAgentEntitlement: vi.fn(),
}));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));
vi.mock("../src/lib/paid-bot-identity", () => ({ PAID_BOT_IDENTITY_JOB_TYPE: "unused" }));
import "../src/routes/agent-routes-v2";

async function request(path: string, body: unknown) {
  const json = vi.fn();
  await h.routes.get(`post ${path}`)!(
    { user: { id: "tenant" }, params: { id: "bot" }, body },
    { json },
  );
  return json.mock.calls[0]?.[0];
}
beforeEach(() => {
  h.owned = true;
  h.alreadySaved = false;
  h.train.mockReset();
  h.image.mockReset();
  h.transaction.mockReset();
});

describe("training routes reserve only validated, owned provider work", () => {
  it("does no paid work for invalid text/assets or a Bot owned by someone else", async () => {
    await expect(
      request("/api/train/extract", { agentId: "bot", message: "" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      request("/api/agent-config/:id/assets", {
        fileName: "file.exe",
        mimeType: "application/octet-stream",
      }),
    ).rejects.toMatchObject({ status: 400 });
    h.owned = false;
    await expect(
      request("/api/train/extract", { agentId: "other", message: "Use our hours" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(h.train).not.toHaveBeenCalled();
    expect(h.image).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("preserves an actionable budget refusal and does not save partial extraction", async () => {
    h.train.mockRejectedValue(
      new AppError(402, "SPEND_CAP_REACHED", "Review Billing or wait for the next monthly reset.", {
        recovery_path: "/settings/billing",
      }),
    );
    await expect(
      request("/api/train/extract", { agentId: "bot", message: "Open weekdays" }),
    ).rejects.toMatchObject({
      status: 402,
      code: "SPEND_CAP_REACHED",
      details: { recovery_path: "/settings/billing" },
    });
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.train).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "tenant",
        source: "training",
        options: expect.objectContaining({ maxTokens: 1200 }),
      }),
    );
  });

  it("updates the delivery tone without replacing the saved operating playbook", async () => {
    const existing =
      "Laptop repair desk.\n\n## DELIVERY TONE\nClear.\n\n## ACCOUNT HOLDER INSTRUCTIONS\nNever quote parts before confirming the laptop model.";
    const values = vi.fn(() => ({ onConflictDoUpdate: vi.fn() }));
    h.transaction.mockImplementation((operation) =>
      operation({
        execute: vi.fn().mockResolvedValue({ rows: [{ id: "bot" }] }),
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => [{ content: existing }] }) }),
        }),
        insert: () => ({ values }),
      }),
    );
    h.train.mockResolvedValue({
      directives: [],
      knowledge: [],
      personality: "Warm and plainspoken.",
    });

    await request("/api/train/extract", {
      agentId: "bot",
      message: "Use a warm, plainspoken tone",
    });

    expect(values).toHaveBeenCalledWith({
      agentId: "bot",
      userId: "tenant",
      content:
        "Laptop repair desk.\n\n## DELIVERY TONE\nWarm and plainspoken.\n\n## ACCOUNT HOLDER INSTRUCTIONS\nNever quote parts before confirming the laptop model.",
    });
  });

  it("merges a Studio tone change into the latest saved instructions", async () => {
    const existing = "## DELIVERY TONE\nClear.\n\n## INSTRUCTIONS\nLatest owner policy.";
    const lock = vi.fn();
    const values = vi.fn(() => ({ onConflictDoUpdate: vi.fn() }));
    h.transaction.mockImplementation((operation) =>
      operation({
        execute: lock,
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => [{ content: existing }] }) }),
        }),
        insert: () => ({ values }),
      }),
    );

    await expect(
      request("/api/agent-config/:id/manual", { type: "tone", content: "Warm" }),
    ).resolves.toMatchObject({ success: true });
    expect(lock).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "## DELIVERY TONE\nWarm. Concise, useful, and discreet.\n\n## INSTRUCTIONS\nLatest owner policy.",
      }),
    );
  });

  it("confirms verbatim saved training without paying for another extraction", async () => {
    h.alreadySaved = true;
    await expect(
      request("/api/train/extract", { agentId: "bot", message: "Diagnostic visits cost $89." }),
    ).resolves.toMatchObject({
      alreadySaved: true,
      readiness: { facts: 0, rules: 0, tone: false },
    });
    expect(h.train).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("saves each identical extracted fact and rule once and reports an already-saved retry", async () => {
    const saved = new Map<unknown, Array<{ content: string }>>();
    const lock = vi.fn().mockResolvedValue({ rows: [{ id: "bot" }] });
    h.transaction.mockImplementation((operation) =>
      operation({
        execute: lock,
        select: () => ({
          from: (table: unknown) => ({ where: async () => saved.get(table) ?? [] }),
        }),
        insert: (table: unknown) => ({
          values: async (rows: Array<{ content: string }>) => {
            saved.set(table, [...(saved.get(table) ?? []), ...rows]);
          },
        }),
      }),
    );
    h.train.mockResolvedValue({
      directives: [
        { content: "Ask for the model number.", priority: 7 },
        { content: "Ask for the model number.", priority: 7 },
      ],
      knowledge: [{ content: "Diagnostic visits cost $89." }],
      personality: "",
    });
    const payload = {
      agentId: "bot",
      message: "Diagnostic visits cost $89. Ask for the model number.",
    };
    const first = await request("/api/train/extract", payload);
    const retry = await request("/api/train/extract", payload);

    expect(first).toMatchObject({ readiness: { facts: 1, rules: 1, tone: false } });
    expect(retry).toMatchObject({
      alreadySaved: true,
      responseContent: "This is already saved in Knowledge.",
      readiness: { facts: 0, rules: 0, tone: false },
    });
    expect(saved.get(schema.directives)).toHaveLength(1);
    expect(saved.get(schema.knowledge)).toHaveLength(1);
    expect(lock).toHaveBeenCalledTimes(2);
  });
});
