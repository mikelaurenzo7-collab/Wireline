import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/api-error";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  owned: true,
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
      from: () => ({ where: () => ({ limit: async () => (h.owned ? [{ id: "bot" }] : []) }) }),
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

function request(path: string, body: unknown) {
  return h.routes.get(`post ${path}`)!(
    { user: { id: "tenant" }, params: { id: "bot" }, body },
    { json: vi.fn() },
  );
}
beforeEach(() => {
  h.owned = true;
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
});
