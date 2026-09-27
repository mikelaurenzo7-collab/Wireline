import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<void>;
const h = vi.hoisted(() => ({
  handler: null as Handler | null,
  owned: true,
  sync: vi.fn(),
}));
vi.mock("express", () => ({
  Router: () => ({
    post: (_path: string, ...handlers: Handler[]) => {
      h.handler = handlers.at(-1)!;
    },
  }),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/middleware/api-rate-limits", () => ({ createIpRateLimiter: () => () => {} }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (h.owned ? [{ id: "bot" }] : []) }) }),
    }),
  },
}));
vi.mock("../src/services/google-drive-sync-v2", () => ({ syncGoogleDriveToKnowledge: h.sync }));
import "../src/routes/workspace-knowledge-routes";

function response() {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const request = { user: { id: "tenant" }, body: { agentId: "bot", userId: "untrusted" } };

beforeEach(() => {
  h.owned = true;
  h.sync.mockReset();
});

describe("Drive import response progress", () => {
  it.each([
    { status: "partial", httpStatus: 200, ingestedCount: 2, failedCount: 1 },
    { status: "blocked", httpStatus: 402, ingestedCount: 0, failedCount: 1 },
  ])("preserves $status progress with the correct HTTP status", async (result) => {
    h.sync.mockResolvedValue({
      ...result,
      message: "Review allowance and retry remaining documents.",
    });
    const res = response();
    await h.handler!(request, res);
    expect(h.sync).toHaveBeenCalledExactlyOnceWith("tenant", "bot");
    expect(res.status).toHaveBeenCalledWith(result.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      status: result.status,
      ingestedCount: result.ingestedCount,
      failedCount: result.failedCount,
      message: "Review allowance and retry remaining documents.",
    });
  });

  it("rejects another tenant's Bot before beginning any document or paid operation", async () => {
    h.owned = false;
    await expect(h.handler!(request, response())).rejects.toMatchObject({ status: 404 });
    expect(h.sync).not.toHaveBeenCalled();
  });
});
